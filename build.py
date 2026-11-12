import json,pathlib
p=pathlib.Path(__file__).parent
theme_script = '<script>' + (p/'theme.js').read_text() + '</script>'
theme_style = '<style>' + (p/'theme.css').read_text() + '</style>'

def themed_html(filename):
    return (p/filename).read_text().replace('</head>', theme_script + theme_style + '</head>', 1)

html=themed_html('page.html')
seed=[{'id':'susibooks','name':'SUSIbooks','description':'Accounting software designed around the needs of Philippine businesses.','category':'Web app','status':'In progress','repo':'','url':'','featured':True,'image':''},{'id':'sanvic','name':'Discover San Vicente','description':'An interactive map for exploring places and local businesses in San Vicente, Palawan.','category':'Web app','status':'In progress','repo':'https://github.com/sanvicpalawan/sanvicmap','url':'https://sanvicmap.vercel.app','featured':True,'image':''},{'id':'azarraga','name':'Azarraga Glass','description':'A digital home for a local glass and aluminum business.','category':'Website','status':'In progress','repo':'https://github.com/sanvicpalawan/azarraga-app-official','url':'https://azarragaglass.vercel.app','featured':True,'image':''},{'id':'amates','name':'Amates Solutions','description':'A website for a solar business, connecting customers with its services.','category':'Website','status':'In progress','repo':'https://github.com/sanvicpalawan/amatessolutions','url':'','featured':True,'image':''}]
code='const ADMIN_HTML='+json.dumps(themed_html('admin.html'))+';\nconst INVENTORY='+json.dumps(json.loads((p/'inventory.json').read_text()))+';\n'+'const HTML='+json.dumps(html)+';\nconst SEED='+json.dumps(seed)+';\n'+(p/'server.js').read_text()
(p/'dist/server').mkdir(parents=True,exist_ok=True)
(p/'dist/server/index.js').write_text(code)
(p/'dist/.openai').mkdir(exist_ok=True)
(p/'dist/.openai/hosting.json').write_text((p/'.openai/hosting.json').read_text())
