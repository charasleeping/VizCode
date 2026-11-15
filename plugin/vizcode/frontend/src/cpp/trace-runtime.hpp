#pragma once
#include <string>
#include <vector>
#include <array>
#include <list>
#include <deque>
#include <map>
#include <set>
#include <unordered_map>
#include <unordered_set>
#include <functional>
#include <type_traits>
#include <cstdint>
#include <cmath>
#include <sstream>
extern "C" __attribute__((import_module("env"), import_name("vizcode_snapshot"))) void __viz_send(const char*, unsigned);
inline std::string __viz_quote(const std::string& s) {
    std::string out="\"";
    for(unsigned char c:s){switch(c){case '"':out+="\\\"";break;case '\\':out+="\\\\";break;case '\n':out+="\\n";break;case '\r':out+="\\r";break;case '\t':out+="\\t";break;default:if(c<32){const char*h="0123456789abcdef";out+="\\u00";out+=h[c>>4];out+=h[c&15];}else out+=c;}}
    return out+"\"";
}
struct __viz_context { std::map<uintptr_t,std::string> heap; int budget=10000; int depth=0; };
template<class T> std::string __viz_encode(const T&,__viz_context&);
struct __viz_variable { std::string name; uintptr_t address; std::function<std::string(__viz_context&)> get; };
struct __viz_frame_data { int id; std::string name; std::vector<__viz_variable> vars; };
inline std::vector<__viz_frame_data> __viz_frames;
inline std::vector<__viz_variable> __viz_globals;
inline std::map<uintptr_t,std::function<std::string(__viz_context&)>> __viz_allocations;
inline int __viz_nextframe=1;
inline std::map<std::pair<uintptr_t,std::string>,unsigned> __viz_objectids;
inline unsigned __viz_nextobject=1;
inline unsigned __viz_id(uintptr_t address,const std::string& type){auto key=std::make_pair(address,type);auto it=__viz_objectids.find(key);if(it!=__viz_objectids.end())return it->second;auto id=__viz_nextobject++;__viz_objectids[key]=id;return id;}
template<class T> unsigned __viz_objectid(const T& value){return __viz_id(reinterpret_cast<uintptr_t>(&value),__PRETTY_FUNCTION__);}

inline std::string __viz_reference(uintptr_t id) { return "[\"REF\","+std::to_string(id)+"]"; }
template<class T> struct __viz_sequence:std::false_type{};
template<class T,class A> struct __viz_sequence<std::vector<T,A>>:std::true_type{};
template<class T,class A> struct __viz_sequence<std::list<T,A>>:std::true_type{};
template<class T,class A> struct __viz_sequence<std::deque<T,A>>:std::true_type{};
template<class T,size_t N> struct __viz_sequence<std::array<T,N>>:std::true_type{};
template<class T,class C,class A> struct __viz_sequence<std::set<T,C,A>>:std::true_type{};
template<class T,class H,class E,class A> struct __viz_sequence<std::unordered_set<T,H,E,A>>:std::true_type{};
template<class T> struct __viz_dictionary:std::false_type{};
template<class K,class V,class C,class A> struct __viz_dictionary<std::map<K,V,C,A>>:std::true_type{};
template<class K,class V,class H,class E,class A> struct __viz_dictionary<std::unordered_map<K,V,H,E,A>>:std::true_type{};
template<class T> std::string __viz_encode(const T& v,__viz_context& c) {
    if(--c.budget<0||c.depth>40)return "\"<snapshot limit>\"";
    using U=std::remove_cv_t<T>;
    if constexpr(std::is_same_v<U,bool>)return v?"true":"false";
    else if constexpr(std::is_same_v<U,std::string>)return __viz_quote(v.substr(0,65536));
    else if constexpr(std::is_same_v<U,char>)return __viz_quote(std::string(1,v));
    else if constexpr(std::is_integral_v<U>)return std::to_string(v);
    else if constexpr(std::is_enum_v<U>)return std::to_string(static_cast<long long>(v));
    else if constexpr(std::is_floating_point_v<U>){if(!std::isfinite(v))return "[\"SPECIAL_FLOAT\","+__viz_quote(std::to_string(v))+"]";std::ostringstream s;s.precision(17);s<<v;return s.str();}
    else if constexpr(std::is_null_pointer_v<U>)return "null";
    else if constexpr(std::is_pointer_v<U>){
        if(!v)return "null";
        uintptr_t address=reinterpret_cast<uintptr_t>(v);
        auto id=__viz_id(address,"pointer");
        if(c.heap.count(id))return __viz_reference(id);
        c.heap[id]="[\"INSTANCE\",\"pointer\",[\"address\","+__viz_quote(std::to_string(address))+"]]";
        std::string target;
        auto a=__viz_allocations.find(address);
        if(a!=__viz_allocations.end())target=a->second(c);
        else {
            auto find=[&](const std::vector<__viz_variable>& vars){for(const auto& x:vars)if(x.address==address)target=x.get(c);};
            find(__viz_globals); for(const auto& f:__viz_frames)find(f.vars);
        }
        if(target.rfind("[\"REF\",",0)==0)return target;
        if(!target.empty())c.heap[id]="[\"HEAP_PRIMITIVE\",\"value\","+target+"]";
        return __viz_reference(id);
    } else {
        auto id=__viz_objectid(v);
        if(c.heap.count(id))return __viz_reference(id);
        c.heap[id]="[\"INSTANCE\",\"Object\"]";
        ++c.depth;
        if constexpr(__viz_sequence<U>::value||std::is_array_v<U>){std::string s="[\"LIST\"";int n=0;for(const auto& x:v){if(n++>=1000)break;s+=","+__viz_encode(x,c);}c.heap[id]=s+"]";}
        else if constexpr(__viz_dictionary<U>::value){std::string s="[\"DICT\"";int n=0;for(const auto& x:v){if(n++>=1000)break;s+=",["+__viz_encode(x.first,c)+","+__viz_encode(x.second,c)+"]";}c.heap[id]=s+"]";}
        --c.depth;
        return __viz_reference(id);
    }
}
template<class T> std::string __viz_record(const T& v,__viz_context& c,const std::string& label,const std::function<std::string()>& fields){
    auto id=__viz_objectid(v);if(c.heap.count(id))return __viz_reference(id);
    if(--c.budget<0||c.depth>40)return "\"<snapshot limit>\"";
    c.heap[id]="[\"INSTANCE\","+__viz_quote(label)+"]";++c.depth;
    auto value="[\"INSTANCE\","+__viz_quote(label)+fields()+"]";--c.depth;c.heap[id]=value;return __viz_reference(id);
}
inline std::string __viz_vars(const std::vector<__viz_variable>& vars,__viz_context& c){std::string s="{";bool first=true;for(const auto& v:vars){if(!first)s+=",";first=false;s+=__viz_quote(v.name)+":"+v.get(c);}return s+"}";}
inline void __viz_step(int line,const char*event="step_line"){
    __viz_context c;auto globals=__viz_vars(__viz_globals,c);std::string frames="[";bool first=true;
    for(const auto& f:__viz_frames){if(!first)frames+=",";first=false;frames+="{\"id\":"+std::to_string(f.id)+",\"name\":"+__viz_quote(f.name)+",\"vars\":"+__viz_vars(f.vars,c)+"}";}
    frames+="]";std::string heap="{";first=true;for(const auto& h:c.heap){if(!first)heap+=",";first=false;heap+=__viz_quote(std::to_string(h.first))+":"+h.second;}heap+="}";
    auto s="{\"event\":"+__viz_quote(event)+",\"line\":"+std::to_string(line)+",\"globals\":"+globals+",\"frames\":"+frames+",\"heap\":"+heap+"}";
    __viz_send(s.data(),s.size());
}
struct __viz_scope { size_t frame,index; __viz_scope():frame(__viz_frames.size()),index(frame?__viz_frames.back().vars.size():__viz_globals.size()){} ~__viz_scope(){if(frame&&__viz_frames.size()>=frame)__viz_frames[frame-1].vars.resize(index);} };
struct __viz_frame { int line; __viz_frame(const char*name,int line):line(line){__viz_frames.push_back({__viz_nextframe++,name,{}});} ~__viz_frame(){__viz_step(line,"return");__viz_frames.pop_back();} };
template<class T> inline void __viz_register(const char*name,T&v){auto get=[&v](__viz_context&c){return __viz_encode(v,c);};__viz_variable var{name,reinterpret_cast<uintptr_t>(&v),get};if(__viz_frames.empty())__viz_globals.push_back(var);else __viz_frames.back().vars.push_back(var);}
template<class T> inline T* __viz_track(T* p){__viz_allocations[reinterpret_cast<uintptr_t>(p)]=[p](__viz_context&c){return __viz_encode(*p,c);};return p;}
template<class T> inline T* __viz_forget(T* p){__viz_allocations.erase(reinterpret_cast<uintptr_t>(p));return p;}

template<class T> inline void __viz_register_uninitialized(const char*name,T&v,bool& initialized){
    auto get=[&v,&initialized](__viz_context&c){return initialized?__viz_encode(v,c):"\"<uninitialized>\"";};
    __viz_variable var{name,reinterpret_cast<uintptr_t>(&v),get};
    if(__viz_frames.empty())__viz_globals.push_back(var);else __viz_frames.back().vars.push_back(var);
}
