import json, sys
import numpy as np, soundfile as sf
from kokoro import KPipeline
p = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
for j in json.load(open(sys.argv[1])):
    audio = np.concatenate([a for _, _, a in p(j["text"], voice="am_michael")])
    sf.write(f"story/{j['name']}.wav", audio, 24000); print("done", j["name"], flush=True)
print("ALL DONE")
