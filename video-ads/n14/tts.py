import subprocess, json
from lines import LINES
D=[]
for i,t in enumerate(LINES,1):
    subprocess.check_call(['python','-m','edge_tts','--voice','pt-BR-FranciscaNeural','--rate=+0%','--text',t,'--write-media',f'tts/{i}.mp3'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    subprocess.check_call(['ffmpeg','-y','-loglevel','error','-i',f'tts/{i}.mp3','-af','silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse',f'tts/{i}t.wav'])
    d=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f'tts/{i}t.wav']))
    D.append(d); print(i,round(d,2))
GAP,PRE,HOLD=0.55,0.35,2.4
S=[0.0]; 
for i in range(5): S.append(S[i]+PRE+D[i]+GAP)
L=[PRE+D[i]+GAP+0.45 for i in range(5)]+[PRE+D[5]+HOLD]
total=S[5]+L[5]
json.dump({'D':D,'S':S,'L':L,'total':total,'pre':PRE},open('timeline.json','w'))
print([round(x,2) for x in S],round(total,2))
