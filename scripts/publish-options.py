#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Publish encrypted options snapshots. Keys remain in private local storage."""
import datetime as dt,fcntl,json,os,shutil,subprocess,sys
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1]
PRIVATE=ROOT.parent/'options-compass-kr/.sites-runtime'
STATE=PRIVATE/'pages'
def command(args,env=None):
 p=subprocess.run(args,cwd=ROOT,env=env,capture_output=True,text=True)
 if p.returncode:raise RuntimeError('command_failed_'+Path(args[0]).name)
 return p.stdout.strip()
def main():
 STATE.mkdir(parents=True,exist_ok=True)
 with (STATE/'publisher.lock').open('w') as handle:
  try:fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:return {'status':'already_running'}
  now=dt.datetime.now(ZoneInfo('Asia/Seoul'));epoch=now.timestamp();force='--force' in sys.argv
  hours=now.weekday()<5 and now.hour>=8 or 1<=now.weekday()<=5 and now.hour<8
  period=1800 if 9<=now.hour<=18 else 3600
  status=STATE/'publisher.json'
  last=json.loads(status.read_text())if status.exists()else{}
  if not force and(not hours or epoch-last.get('lastSuccess',0)<period):return {'status':'waiting'}
  if command(['git','status','--porcelain']):raise RuntimeError('checkout_has_pending_changes')
  command(['git','fetch','origin','main']);command(['git','merge','--ff-only','origin/main'])
  env=os.environ.copy();env['OPTIONS_VIEW_PASSWORD']=json.loads((STATE/'access.json').read_text())['password'];env['OPTIONS_SITE_SERVICE_TOKEN']=json.loads((PRIVATE/'orderflow/service.json').read_text())['serviceToken']
  node=os.environ.get('OPTIONS_NODE')or shutil.which('node')
  if not node:raise RuntimeError('node_missing')
  command([node,'scripts/export-options.mjs'],env)
  command(['git','add','options-compass/data/snapshot.json','options-compass/data/status.json'])
  changed=bool(command(['git','diff','--cached','--name-only']))
  if changed:command(['git','commit','-m','Refresh encrypted options snapshot '+now.strftime('%Y-%m-%d %H:%M KST')])
  # Also retries a preceding committed push whose response was lost.
  for attempt in range(3):
   try:command(['git','push','origin','HEAD:main']);break
   except RuntimeError:
    if attempt==2:raise
    command(['git','fetch','origin','main']);command(['git','rebase','origin/main'])
  status.write_text(json.dumps({'lastSuccess':epoch,'checkedAt':now.isoformat()}))
  return {'status':'published'if changed else'unchanged','checkedAt':now.isoformat()}
if __name__=='__main__':
 try:print(json.dumps(main(),ensure_ascii=False))
 except Exception as e:print(json.dumps({'status':'failed','reason':str(e)if isinstance(e,RuntimeError)else type(e).__name__}));sys.exit(1)
