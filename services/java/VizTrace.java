/* SPDX-License-Identifier: GPL-3.0-or-later
 * The controller and target run together in a disposable, networkless job.
 * JDI reads values directly; it never calls student toString/getters to render them.
 */
import com.sun.jdi.*;
import com.sun.jdi.connect.*;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;
import com.sun.source.tree.*;
import com.sun.source.util.*;
import javax.tools.*;
import javax.lang.model.element.Modifier;
import java.util.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

public final class VizTrace {
    static final int MAX_STEPS=1000;
    static Map<String,Object> request;
    static String code,calls,traceCode,sourceName,mainClass;
    static int offset,boundary;
    static List<Object> trace=new ArrayList<>();
    static Set<String> userClasses=new HashSet<>();
    static Map<String,Object> inputRequest;
    static VirtualMachine vm;
    static long deadline,traceBytes;
    static String stdout="";
    static Map<String,Object> map(Object...values){Map<String,Object> m=new LinkedHashMap<>();for(int i=0;i<values.length;i+=2)m.put((String)values[i],values[i+1]);return m;}
    static String string(Object value){return value instanceof String?(String)value:"";}
    public static void main(String[]args) {
        Process process=null;
        try {
            String raw=new String(System.in.readNBytes(650001),StandardCharsets.UTF_8);
            if(raw.length()>650000)throw new IllegalArgumentException("Java request is too large.");
            request=(Map<String,Object>)Json.parse(raw);code=string(request.get("code"));calls=string(request.get("scratchCode"));
            if(code.length()>100000 || calls.length()>100000)throw new IllegalArgumentException("Source exceeds the debugging limit.");
            if(string(request.get("stdin")).length()>100000)throw new IllegalArgumentException("Input exceeds the debugging limit.");
            traceCode=code+"\n// Scratch (local only)\n"+calls;boundary=code.split("\n",-1).length+1;
            Path dir=Files.createTempDirectory("viztrace-");Path classes=Files.createDirectory(dir.resolve("classes"));
            prepare(dir);
            JavaCompiler compiler=ToolProvider.getSystemJavaCompiler();DiagnosticCollector<JavaFileObject> diagnostics=new DiagnosticCollector<>();
            try(StandardJavaFileManager fm=compiler.getStandardFileManager(diagnostics,null,StandardCharsets.UTF_8)){
                var files=fm.getJavaFileObjects(dir.resolve(sourceName).toFile(),dir.resolve("VizIO.java").toFile(),dir.resolve("VizLauncher.java").toFile());
                boolean ok=compiler.getTask(null,fm,diagnostics,List.of("--release","21","-g","-proc:none","-d",classes.toString()),null,files).call();
                if(!ok){StringBuilder error=new StringBuilder();for(var d:diagnostics.getDiagnostics())if(d.getKind()==Diagnostic.Kind.ERROR){
                    String file=d.getSource()==null?"answer":Path.of(d.getSource().toUri()).getFileName().toString();
                    long line=d.getLineNumber()-(file.equals(sourceName)?offset:0);
                    error.append(file.equals("VizLauncher.java")?"Function call": "Answer").append(", line ").append(Math.max(1,line)).append(": ").append(d.getMessage(Locale.ENGLISH)).append('\n');
                }throw new IllegalArgumentException(error.toString().trim());}
            }
            if(Boolean.TRUE.equals(request.get("diagnose")))throw new IllegalArgumentException("This Java syntax is not supported by the live editor.");
            LaunchingConnector connector=Bootstrap.virtualMachineManager().defaultConnector();Map<String,Connector.Argument> options=connector.defaultArguments();
            options.get("main").setValue("VizLauncher");options.get("options").setValue("-Xmx128m -Xss1m -XX:+UseSerialGC -XX:ActiveProcessorCount=1 -cp "+classes);
            options.get("suspend").setValue("true");vm=connector.launch(options);process=vm.process();
            // Drain non-program JVM errors without retaining unbounded output.
            final Process target=process;Thread errors=Thread.ofPlatform().daemon().start(()->{try{target.getErrorStream().transferTo(java.io.OutputStream.nullOutputStream());}catch(Exception ignored){}});
            EventRequestManager manager=vm.eventRequestManager();
            MethodEntryRequest entries=manager.createMethodEntryRequest();
            MethodExitRequest exits=manager.createMethodExitRequest();
            for(String pattern:List.of("java.*","javax.*","jdk.*","sun.*","com.sun.*","VizIO*","VizLauncher")){entries.addClassExclusionFilter(pattern);exits.addClassExclusionFilter(pattern);}
            entries.setSuspendPolicy(EventRequest.SUSPEND_ALL);exits.setSuspendPolicy(EventRequest.SUSPEND_ALL);entries.enable();exits.enable();
            ExceptionRequest exceptions=manager.createExceptionRequest(null,true,true);exceptions.setSuspendPolicy(EventRequest.SUSPEND_ALL);exceptions.enable();
            ThreadStartRequest threads=manager.createThreadStartRequest();threads.setSuspendPolicy(EventRequest.SUSPEND_ALL);threads.enable();
            VMDeathRequest death=manager.createVMDeathRequest();death.setSuspendPolicy(EventRequest.SUSPEND_ALL);death.enable();
            deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10);
            boolean done=false,started=false;
            while(!done){
                if(System.nanoTime()>deadline)throw new IllegalArgumentException("Execution timed out (10 seconds).");
                EventSet events=vm.eventQueue().remove(200);if(events==null)continue;
                for(Event event:events){
                    if(event instanceof VMStartEvent start){
                        StepRequest step=manager.createStepRequest(start.thread(),StepRequest.STEP_LINE,StepRequest.STEP_INTO);
                        for(String pattern:List.of("java.*","javax.*","jdk.*","sun.*","com.sun.*","VizIO*"))step.addClassExclusionFilter(pattern);
                        step.setSuspendPolicy(EventRequest.SUSPEND_ALL);step.enable();started=true;
                    }else if(event instanceof ThreadStartEvent threadStart){
                        if(!List.of("main","DestroyJavaVM","Reference Handler","Finalizer","Signal Dispatcher","Notification Thread","Common-Cleaner").contains(threadStart.thread().name()))throw new IllegalArgumentException("Live Java debugging supports single-threaded console programs (thread: "+threadStart.thread().name()+").");
                    }else if(event instanceof StepEvent step){
                        Location loc=step.location();String type=loc.declaringType().name();
                        if(type.equals("VizLauncher") || isUser(type))snapshot(step.thread(),loc,"step_line",null);
                    }else if(event instanceof MethodEntryEvent entry){
                        if(isUser(entry.location().declaringType().name()))snapshot(entry.thread(),entry.location(),"call",null);
                    }else if(event instanceof MethodExitEvent exit){
                        if(isUser(exit.location().declaringType().name())){
                            int before=trace.size();snapshot(exit.thread(),exit.location(),"return",null);
                            if(trace.size()>before)((Map<String,Object>)trace.get(trace.size()-1)).put("return_kind",exit.returnValue() instanceof VoidValue?"void":"value");
                            if(trace.size()>before && !(exit.returnValue() instanceof VoidValue)){
                                Map<String,Object> current=(Map<String,Object>)trace.get(trace.size()-1);
                                current.put("return_kind",exit.returnValue() instanceof VoidValue?"void":"value");
                                List<Object> frames=(List<Object>)current.get("stack_to_render");
                                if(!frames.isEmpty()){
                                    int previousBytes=Json.write(current).getBytes(StandardCharsets.UTF_8).length;
                                    Snapshot returned=new Snapshot();Object encoded=returned.value(exit.returnValue(),0);
                                    ((Map<String,Object>)((Map<String,Object>)frames.get(frames.size()-1)).get("encoded_locals")).put("__return__",encoded);
                                    ((List<String>)((Map<String,Object>)frames.get(frames.size()-1)).get("ordered_varnames")).add("__return__");
                                    ((Map<String,Object>)current.get("heap")).putAll(returned.heap);
                                    traceBytes+=Json.write(current).getBytes(StandardCharsets.UTF_8).length-previousBytes;
                                    if(traceBytes>2000000)throw new IllegalArgumentException("Trace exceeds 2 MiB limit.");
                                }
                            }
                        }
                    }else if(event instanceof ExceptionEvent error){
                        String type=error.exception().referenceType().name();
                        if(type.equals("VizIO$NeedInput")){
                            updateStdout();String kind=fieldString(error.exception(),"kind");
                            inputRequest=map("kind",kind.equals("all")?"all":"line","prompt","","step",Math.max(0,trace.size()-1));done=true;break;
                        }
                        Location diagnostic=error.location();
                        boolean uncaught=error.catchLocation()==null || error.catchLocation().declaringType().name().equals("VizLauncher");
                        boolean caughtByUser=error.catchLocation()!=null && isUser(error.catchLocation().declaringType().name());
                        if(!isUser(diagnostic.declaringType().name()) && (uncaught || caughtByUser)) {
                            // Library exceptions still belong at the student's calling line.
                            for(StackFrame frame:error.thread().frames())if(isUser(frame.location().declaringType().name())){diagnostic=frame.location();break;}
                        }
                        if(isUser(diagnostic.declaringType().name())){
                            String message=type+": "+fieldString(error.exception(),"detailMessage");
                            snapshot(error.thread(),diagnostic,"exception",message);
                            if(uncaught)done=true;
                        }
                    }else if(event instanceof VMDeathEvent){updateStdout();done=true;}
                    else if(event instanceof VMDisconnectEvent){done=true;}
                }
                if(trace.size()>=MAX_STEPS){trace.add(map("event","instruction_limit_reached","exception_msg","Trace limit reached (1000 steps).","stdout",stdout));done=true;}
                if(!done)events.resume();
            }
            if(trace.isEmpty())trace.add(map("event","step_line","line",1,"source_area","answer","source_line",1,"stdout",stdout,"globals",map(),"ordered_globals",List.of(),"func_name","<module>","heap",map(),"stack_to_render",List.of()));
            if(inputRequest!=null)inputRequest.put("step",Math.max(0,trace.size()-1));
            ((Map<String,Object>)trace.get(trace.size()-1)).put("stdout",stdout);
            String result=Json.write(map("code",traceCode,"trace",trace,"scratchStart",boundary+1,"inputRequest",inputRequest));
            if(result.getBytes(StandardCharsets.UTF_8).length>2097152)throw new IllegalArgumentException("Trace exceeds 2 MiB limit.");
            System.out.println(result);
        }catch(Throwable error){System.out.println(Json.write(map("error",string(error.getMessage()).isEmpty()?error.getClass().getSimpleName():error.getMessage())));}
        finally{if(vm!=null)try{vm.exit(0);}catch(Throwable ignored){}if(process!=null)process.destroyForcibly();}
    }
    static boolean isUser(String name){return userClasses.stream().anyMatch(c->name.equals(c)||name.startsWith(c+"$"));}
    static String fieldString(ObjectReference object,String name){Field f=object.referenceType().fieldByName(name);if(f==null)return "";Value value=object.getValue(f);return value instanceof StringReference?( (StringReference)value).value():"";}
    static void updateStdout(){
        try{List<ReferenceType> types=vm.classesByName("VizIO");if(!types.isEmpty()){
            Value value=types.get(0).getValue(types.get(0).fieldByName("stdout"));if(value instanceof StringReference)stdout=((StringReference)value).value();
            if(stdout.getBytes(StandardCharsets.UTF_8).length>65536)throw new IllegalArgumentException("Output exceeds 64 KiB limit.");
        }}catch(VMDisconnectedException ignored){}
    }
    static void snapshot(ThreadReference thread,Location loc,String event,String error)throws Exception{
        int line=loc.lineNumber();String type=loc.declaringType().name();String area="answer";
        if(type.equals("VizLauncher")){
            // Launcher has three fixed prefix lines, then one generated call per source line.
            line=line-3;if(line<1 || line>calls.split("\n",-1).length || calls.isBlank())return;
            area="scratch";
        }else {line-=offset;if(line<1 || line>code.split("\n",-1).length)return;}
        updateStdout();Snapshot data=new Snapshot();List<Object> stack=new ArrayList<>();
        List<StackFrame> frames=new ArrayList<>(thread.frames());Collections.reverse(frames);int id=0;
        for(StackFrame frame:frames){
            String frameType=frame.location().declaringType().name();if(!isUser(frameType))continue;
            if(stack.size()>=64)throw new IllegalArgumentException("Stack exceeds 64 frames.");
            Map<String,Object> locals=map();List<String> ordered=new ArrayList<>();
            try{for(LocalVariable local:frame.visibleVariables()){locals.put(local.name(),data.value(frame.getValue(local),0));ordered.add(local.name());}}catch(AbsentInformationException ignored){}
            if(frame.thisObject()!=null){locals.put("this",data.value(frame.thisObject(),0));ordered.add(0,"this");}
            stack.add(map("frame_id",++id,"func_name",frameType+"."+frame.location().method().name(),"encoded_locals",locals,"ordered_varnames",ordered,"is_highlighted",false,"is_parent",false,"unique_hash",String.valueOf(id),"is_zombie",false,"parent_frame_id_list",List.of()));
        }
        if(!stack.isEmpty())((Map<String,Object>)stack.get(stack.size()-1)).put("is_highlighted",true);
        Map<String,Object> globals=map();
        for(String name:userClasses){for(ReferenceType cls:vm.classesByName(name))for(Field field:cls.fields())if(field.isStatic() && !field.isSynthetic())globals.put(name+"."+field.name(),data.value(cls.getValue(field),0));}
        int combined=area.equals("answer")?line:boundary+line;
        Map<String,Object> entry=map("event",event,"line",combined,"source_area",area,"source_line",line,"stdout",stdout,
            "globals",globals,"ordered_globals",new ArrayList<>(globals.keySet()),"heap",data.heap,"stack_to_render",stack,
            "func_name",stack.isEmpty()?"<module>":((Map<?,?>)stack.get(stack.size()-1)).get("func_name"));
        if(error!=null)entry.put("exception_msg",error);
        traceBytes+=Json.write(entry).getBytes(StandardCharsets.UTF_8).length;
        if(traceBytes>2000000)throw new IllegalArgumentException("Trace exceeds 2 MiB limit.");
        trace.add(entry);
    }
    static final class Snapshot {
        Map<String,Object> heap=map();int values;
        Object value(Value value,int depth){
            if(++values>10000 || depth>12)return List.of("IMPORTED_FAUX_PRIMITIVE","<snapshot limit>");
            if(value==null)return null;
            if(value instanceof StringReference s){
                Field storage=s.referenceType().fieldByName("value");
                if(storage!=null && s.getValue(storage) instanceof ArrayReference bytes && bytes.length()>100000)return "<String exceeds display limit>";
                return s.value();
            }
            if(value instanceof BooleanValue b)return b.value();
            if(value instanceof CharValue c)return String.valueOf(c.value());
            if(value instanceof PrimitiveValue p){if(p instanceof FloatValue || p instanceof DoubleValue){double d=p.doubleValue();return Double.isFinite(d)?d:List.of("SPECIAL_FLOAT",String.valueOf(d));}long integer=p.longValue();return integer>9007199254740991L || integer< -9007199254740991L?List.of("IMPORTED_FAUX_PRIMITIVE",Long.toString(integer)):integer;}
            if(value instanceof ObjectReference object){
                long id=object.uniqueID();String key=Long.toString(id);
                if(!heap.containsKey(key) && heap.size()>=300)return List.of("IMPORTED_FAUX_PRIMITIVE","<object limit>");
                if(!heap.containsKey(key) && heap.size()<300){List<Object> encoded=new ArrayList<>();heap.put(key,encoded);
                    if(object instanceof ArrayReference array){encoded.add("LIST");for(Value item:array.getValues(0,Math.min(200,array.length())))encoded.add(value(item,depth+1));if(array.length()>200)encoded.add(List.of("IMPORTED_FAUX_PRIMITIVE","<truncated array>"));}
                    else if(object.referenceType().name().equals("java.util.ArrayList")){
                        encoded.add("LIST");Field dataField=object.referenceType().fieldByName("elementData"),sizeField=object.referenceType().fieldByName("size");
                        if(dataField!=null && sizeField!=null && object.getValue(dataField) instanceof ArrayReference array && object.getValue(sizeField) instanceof IntegerValue size)
                            for(Value item:array.getValues(0,Math.min(200,Math.min(array.length(),size.value()))))encoded.add(value(item,depth+1));
                    }
                    else if(object.referenceType().name().startsWith("java.") || object.referenceType().name().startsWith("jdk.") || object.referenceType().name().startsWith("sun.")){
                        // Runtime internals (Scanner's regex graph, class loaders, etc.)
                        // are opaque, not thousands of unrelated implementation objects.
                        encoded.add("INSTANCE");encoded.add(object.referenceType().name());
                        Field boxed=object.referenceType().fieldByName("value");if(boxed!=null && object.getValue(boxed) instanceof PrimitiveValue primitive)encoded.add(Arrays.asList("value",value(primitive,depth+1)));
                    }
                    else{encoded.add("INSTANCE");encoded.add(object.referenceType().name());int count=0;
                        for(Field field:object.referenceType().allFields())if(!field.isStatic() && !field.isSynthetic() && count++<80){encoded.add(Arrays.asList(field.name(),value(object.getValue(field),depth+1)));}
                    }
                }
                return List.of("REF",id);
            }
            return value.toString();
        }
    }
    static List<ClassTree> parse(String source)throws Exception{
        JavaCompiler compiler=ToolProvider.getSystemJavaCompiler();JavaFileObject file=new SimpleJavaFileObject(java.net.URI.create("string:///Answer.java"),JavaFileObject.Kind.SOURCE){public CharSequence getCharContent(boolean ignored){return source;}};
        JavacTask task=(JavacTask)compiler.getTask(null,null,new DiagnosticCollector<>(),List.of("-proc:none"),null,List.of(file));
        List<ClassTree> classes=new ArrayList<>();for(CompilationUnitTree unit:task.parse()){
            if(unit.getPackageName()!=null)throw new IllegalArgumentException("Live Java debugging supports a single file without a package declaration.");
            for(Tree type:unit.getTypeDecls())if(type instanceof ClassTree cls && !cls.getSimpleName().toString().isBlank())classes.add(cls);
        }return classes;
    }
    static boolean explicitOuterClass(String source,List<ClassTree> classes){
        // javac represents method fragments as an implicit class named after the
        // input file even when preview features are disabled. Match its declared
        // name only against actual lexical class keywords, excluding comments/literals.
        String clean=source.replaceAll("(?s)/\\*.*?\\*/|//[^\\n]*|\"(?:\\\\.|[^\"\\\\])*\"", " ");
        return classes.stream().anyMatch(c->java.util.regex.Pattern.compile("\\b(?:class|record|enum|interface)\\s+"+java.util.regex.Pattern.quote(c.getSimpleName().toString())+"\\b").matcher(clean).find());
    }
    static void prepare(Path dir)throws Exception{
        String source=code;List<ClassTree> classes=parse(source);
        if(classes.isEmpty() || !explicitOuterClass(code,classes)){source="class VizAnswer {\n"+code+"\n}";offset=1;classes=parse(source);}
        if(classes.isEmpty())throw new IllegalArgumentException("Define a Java class or method before debugging.");
        ClassTree primary=classes.get(0);for(ClassTree cls:classes){userClasses.add(cls.getSimpleName().toString());if(cls.getModifiers().getFlags().contains(Modifier.PUBLIC))primary=cls;
            for(Tree member:cls.getMembers())if(member instanceof MethodTree method && method.getName().contentEquals("main") && method.getModifiers().getFlags().contains(Modifier.STATIC))mainClass=cls.getSimpleName().toString();
        }
        if(userClasses.contains("VizIO") || userClasses.contains("VizLauncher"))throw new IllegalArgumentException("Rename VizIO or VizLauncher for live debugging; those class names are reserved by the debugger.");
        sourceName=primary.getSimpleName()+".java";Files.writeString(dir.resolve(sourceName),source);
        String input=Base64.getEncoder().encodeToString(string(request.get("stdin")).getBytes(StandardCharsets.UTF_8));boolean eof=Boolean.TRUE.equals(request.get("inputEof"));
        String io="""
import java.io.*;
class VizIO {
 public static String stdout="";
 static class NeedInput extends Error { final String kind; NeedInput(String kind){this.kind=kind;} }
 static class Input extends InputStream {
  final byte[] data=java.util.Base64.getDecoder().decode("INPUT"); int pos; final boolean eof=EOF;
  public int read(){if(pos>=data.length){if(!eof)throw new NeedInput("line");return -1;}return data[pos++]&255;}
  public int read(byte[] b,int off,int len){if(len==0)return 0;if(pos>=data.length){if(!eof)throw new NeedInput("line");return -1;}
   int n=Math.min(len,data.length-pos);System.arraycopy(data,pos,b,off,n);pos+=n;return n;}
  public byte[] readAllBytes(){if(!eof)throw new NeedInput("all");byte[] result=java.util.Arrays.copyOfRange(data,pos,data.length);pos=data.length;return result;}
 }
 static void setup(){System.setIn(new Input());System.setOut(new PrintStream(new OutputStream(){final ByteArrayOutputStream bytes=new ByteArrayOutputStream();
  public void write(int b){bytes.write(b);stdout=bytes.toString(java.nio.charset.StandardCharsets.UTF_8);if(bytes.size()>65536)throw new IllegalStateException("Output exceeds 64 KiB limit.");}
  public void write(byte[] b,int off,int len){bytes.write(b,off,len);stdout=bytes.toString(java.nio.charset.StandardCharsets.UTF_8);if(bytes.size()>65536)throw new IllegalStateException("Output exceeds 64 KiB limit.");}
 },true,java.nio.charset.StandardCharsets.UTF_8));}
}
""".replace("INPUT",input).replace("EOF",String.valueOf(eof));
        Files.writeString(dir.resolve("VizIO.java"),io);
        String invoke=mainClass!=null?mainClass+".main(args);":calls;
        Files.writeString(dir.resolve("VizLauncher.java"),"class VizLauncher {\npublic static void main(String[] args) throws Throwable {\nVizIO.setup();\n"+invoke+"\n}\n}\n");
    }
    /** Small bounded JSON codec; only the supervisor supplies this stdin. */
    static final class Json {
        final String s;int i;Json(String s){this.s=s;}
        static Object parse(String s){Json p=new Json(s);Object result=p.value(0);p.space();if(p.i!=s.length())throw new IllegalArgumentException("Invalid JSON");return result;}
        void space(){while(i<s.length()&&Character.isWhitespace(s.charAt(i)))i++;}
        Object value(int depth){if(depth>50)throw new IllegalArgumentException("JSON is too deep");space();char c=s.charAt(i++);
            if(c=='"'){StringBuilder b=new StringBuilder();while(i<s.length()){c=s.charAt(i++);if(c=='"')return b.toString();if(c=='\\'){c=s.charAt(i++);switch(c){case 'n':b.append('\n');break;case 'r':b.append('\r');break;case 't':b.append('\t');break;case 'b':b.append('\b');break;case 'f':b.append('\f');break;case 'u':b.append((char)Integer.parseInt(s.substring(i,i+4),16));i+=4;break;default:b.append(c);}}else b.append(c);}throw new IllegalArgumentException("Invalid JSON string");}
            if(c=='{'){Map<String,Object> m=map();space();if(s.charAt(i)=='}'){i++;return m;}while(true){space();String key=(String)value(depth+1);space();if(s.charAt(i++)!=':')throw new IllegalArgumentException("Invalid JSON object");m.put(key,value(depth+1));space();c=s.charAt(i++);if(c=='}')return m;if(c!=',')throw new IllegalArgumentException("Invalid JSON object");}}
            if(c=='['){List<Object> a=new ArrayList<>();space();if(s.charAt(i)==']'){i++;return a;}while(true){a.add(value(depth+1));space();c=s.charAt(i++);if(c==']')return a;if(c!=',')throw new IllegalArgumentException("Invalid JSON array");}}
            int start=i-1;while(i<s.length()&&",]} \t\r\n".indexOf(s.charAt(i))<0)i++;String word=s.substring(start,i);
            return switch(word){case "true"->true;case "false"->false;case "null"->null;default->Double.parseDouble(word);};
        }
        static String write(Object v){if(v==null)return "null";if(v instanceof Boolean || v instanceof Number)return v.toString();if(v instanceof String s){StringBuilder b=new StringBuilder("\"");for(char c:s.toCharArray()){switch(c){case '"':b.append("\\\"");break;case '\\':b.append("\\\\");break;case '\n':b.append("\\n");break;case '\r':b.append("\\r");break;case '\t':b.append("\\t");break;default:if(c<32)b.append(String.format("\\u%04x",(int)c));else b.append(c);}}return b.append('"').toString();}
            if(v instanceof Map<?,?> map){List<String> parts=new ArrayList<>();for(var e:map.entrySet())parts.add(write(e.getKey().toString())+":"+write(e.getValue()));return "{"+String.join(",",parts)+"}";}
            if(v instanceof Iterable<?> a){List<String> parts=new ArrayList<>();for(Object x:a)parts.add(write(x));return "["+String.join(",",parts)+"]";}throw new IllegalArgumentException("Invalid JSON value");}
    }
}
