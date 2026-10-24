# Staff in a box

A working slice of a command-and-control system for one fictional brigade exercise on real terrain (the Aube valley,
France), running on two laptops with no internet. Built to measure one question: **where does an LLM actually help
military planning, and where should code decide?**

Scope line: planning, situational awareness and logistics. A human decides; every suggestion cites its source.
No targeting, no imagery of real forces, no real orders of battle. Public doctrine (FM 5-0 / NATO formats) only.

## Modules
1. **Ground truth** (`scenario/`): the exercise as exact facts; every message and test is generated from it, so
   everything is graded automatically.
2. **Roads and terrain** (`sib/roads.py`): OpenStreetMap graph, convoy times, the 19 real Aube road bridges, cut
   bridges as a routing input.
3. **Reports in**: radio traffic (TTS, noise, FR/EN) -> Whisper -> SPOTREP / SITREP / LOGSTAT records with
   provenance; fusion of duplicates, ageing, conflict flags; the common operational picture.
4. **Orders out**: voice intent -> five-paragraph OPORD, FRAGO, overlay, sync matrix.
5. **Courses of action**: three arms on the same scenarios: A solver only (OR-Tools), B LLM only, C LLM sketch +
   solver. Scored on feasible / acceptable / suitable / distinguishable / complete, violations, diversity,
   10-run stability, time to plan.
6. **Wargame**: action / reaction / counteraction per phase vs RED's most likely and most dangerous COA; rules
   adjudicate, the LLM only plays RED's choices.
7. **Paper map**: photo of a hand-drawn overlay -> digital layer.
8. **DDIL**: two nodes edit offline and merge on reconnect (event log + CRDT-style merge).

## Milestones
- Day 4, v1 (apply with it): orders text -> structured -> map, offline model, validator, eval numbers.
- Day 9: radio in, voice orders, logistics.
- Day 13: COA three-arm experiment + wargame, paper map, two-laptop merge.
- Day 15: demo video and onsite presentation.
