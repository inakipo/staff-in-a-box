# Reading radio messages with a local model (2026-10-25)

Radio spot reports (French and English, terse or casual, typos, grids or "2 km N of the Brienne bridge") are generated from
the ground truth with their correct reading attached (`sib/radio.py`). A 4B model (Qwen3.5-4B, 4-bit, MLX) only READS: it
extracts the time, count, vehicle type, activity, direction and a location REFERENCE. Code turns the reference into a map
position and the time into minutes after H-hour, and a code guard checks every field against the text (`sib/guard.py`).

Two test sets: 138 messages from the same generator as the training data, and 80 of them rewritten by a different model
(gpt-oss-120b) in its own words, kept only if every number and landmark survived. The rewrites are the honest test.
"All fields" = every field exactly right and the location within 500 m.

| Reader | Same-generator test (138) | Rewritten test (80) |
|---|---|---|
| Base 4B, prompted | 74.6 % | 62.5 % |
| Base + code guard | 76.8 % | 62.5 % |
| Fine-tuned (LoRA, 200 steps on 3,001 messages) | 82.6 % | 71.2 % |
| **Fine-tuned + code guard** | **89.1 %** | **78.8 %** |

What the fine-tune taught, and what it got wrong:
- It fixed the vocabulary: "chars" are tanks, "VTT" and "armoured carriers" are troop carriers (vehicle type 81 % to 91 %).
- It learned a bias from the data: plain "vehicles" became tanks (13 cases), because the training set had few generic reports.
- It invents a time when the message has none (10 cases, "0640", a frequent training time). The guard catches every one:
  a time must literally appear in the text. Time accuracy goes to 100 % with the guard, for both models.
- The gap between the two tests (89 % vs 79 %) says the fine-tune partly learned the generator's phrasing. Next: train on
  rewritten messages too, rebalance generic reports, and run the full 600 steps.

Effect on the enemy picture (fusion on the three full streams): the reading errors did not change which Red units were
found or how many tracks were built. Fusion relies on position and time, which the model reads well; type errors only
change a track's label.

Runs on a laptop: on an M4 MacBook with the network disabled for the process, the fine-tuned model reads a message in about
3 s using 0.63 GB of memory. Training ran on a rented A40 with MLX's CUDA backend (the same adapter file loads on the Mac).
