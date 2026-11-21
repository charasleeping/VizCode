"""Object inspection must not call user formatting/properties or lose integer digits."""
import importlib.util,pathlib
path=pathlib.Path(__file__).resolve().parents[2]/'plugin/vizcode/frontend/src/opt/optlite/pg_encoder.py'
spec=importlib.util.spec_from_file_location('pg_encoder',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Parent:
 render_heap_primitives=False
 types_to_inline=[]
 def should_hide_var(self,name):return False
encoder=module.ObjectEncoder(Parent())
class Box:
 __slots__=('value','next')
 def __str__(self):raise AssertionError('Student formatter was executed')
 @property
 def computed(self):raise AssertionError('Student property was executed')
b=Box();b.value=9007199254740993;b.next=b
reference=encoder.encode(b,None);node=encoder.get_heap()[reference[1]]
assert ['next',reference] in node,node
assert ['value',['IMPORTED_FAUX_PRIMITIVE','9007199254740993']] in node,node
b.value=9;encoder.reset_heap();assert encoder.encode(b,None)==reference
assert ['value',9] in encoder.get_heap()[reference[1]]
assert ['value',['IMPORTED_FAUX_PRIMITIVE','9007199254740993']] in node,'Earlier snapshot was mutated'
encoder.reset_heap();encoder.encode(list(range(10000)),None)
assert '<truncated>' in str(encoder.get_heap())
encoder.reset_heap();encoder.encode(None,None);value=[]
encoder.id_to_small_IDs[id(value)]=999999
encoder.reset_heap();assert encoder.encode(value,None)!=['REF',999999]
print('Python slots, cycles, immutable snapshots, exact integers and non-executing stored-field inspection passed')
