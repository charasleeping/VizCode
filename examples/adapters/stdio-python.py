"""Minimal language-neutral executable adapter: a tiny integer-sum teaching language."""
import sys,json
try:
 request=json.load(sys.stdin)
 # Example language: each line is an integer. Each step adds it to total.
 total=0;events=[]
 for line,text in enumerate(request['code'].splitlines(),1):
  if not text.strip():continue
  total+=int(text.strip())
  events.append({'kind':'step_line','location':{'source':'answer','line':line},'frames':[{'id':'main','name':'main','locals':[{'name':'total','value':{'kind':'integer','value':str(total)}}]}],'globals':[],'objects':{},'stdout':''})
 print(json.dumps({'version':'1.0','code':request['code'],'events':events}))
except Exception as error:print(json.dumps({'error':str(error)}))
