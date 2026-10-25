"""Staff in a box, the story video: five questions, one idea per segment.
Each segment: lesson id in the 3D viewer, animation progress range, optional camera, focus rings (place or crossing keys),
on-screen caption, chapter tag, whether the side panel (table or chart) is shown, and the narration.
Narration uses real French names; for English-only voices, PHONETIC is applied."""

PHONETIC = [("Châlons-en-Champagne", "Shah-lon on Champagne"), ("Brienne-le-Château", "Bree-enn luh Shah-toe"),
            ("Arcis-sur-Aube", "Ar-see sir Ohb"), ("Vitry-le-François", "Vee-tree luh Frahn-swah"), ("Camp de Mailly", "Comp duh My-ee"),
            ("Ramerupt", "Ram-rue"), ("Brienne", "Bree-enn"), ("Arcis", "Ar-see"), ("the Aube", "the Ohb"), ("Aube", "Ohb"), ("Vitry", "Vee-tree")]

SEG = [
    # ---------------- intro
    dict(ch="Staff in a box", lesson="intro", p=(0, 0.25), cap="A real piece of France, 60 by 70 km",
         text="This is a real piece of France, about sixty by seventy kilometres, east of Paris. The hills are stretched twelve times so you can "
              "see them. Everything you will see in this video is calculated, not drawn by hand, and none of it uses an AI model."),
    dict(ch="Staff in a box", lesson="graph", p=(0, 0.3), focus=["X1", "X4", "X5", "X6"], cap="The river Aube and its bridges",
         text="The thick blue line across the bottom is the river Aube. The orange squares are the road bridges over it, X one to X six. "
              "In this exercise, the bridges are everything: whoever holds them decides who crosses."),
    dict(ch="Staff in a box", lesson="truth", p=(0, 0), focus=["camp_mailly", "vitry"], cap="Blue is us. Red comes from the east.",
         text="Blue is us, starting at Camp de Mailly, a real army training ground. The mission: grab the bridges at Arcis and Ramerupt so a "
              "friendly army can cross, and stop Red from crossing at the two Brienne bridges. Red starts at Vitry-le-François, in the east."),
    dict(ch="Staff in a box", lesson="intro", p=(0.25, 0.5), cap="Five questions",
         text="The engine answers five questions, in order. How fast can we get there? Where is the enemy? Who should go where? "
              "Will the plan survive bad luck? And: did we forget something?"),
    # ---------------- Q1
    dict(ch="Question 1 of 5: how fast can we get there?", lesson="dijkstra", p=(0, 0.45), focus=["camp_mailly"], cap="Search outward from the camp",
         text="Question one: how fast can we get to the bridges at Arcis? Every road becomes a network of fifty four thousand points, and each "
              "road segment knows how many minutes it takes to drive. Now watch the coloured dots: that is the computer searching outward "
              "from the camp, like water spilling over the map."),
    dict(ch="Question 1 of 5: how fast can we get there?", lesson="dijkstra", p=(0.45, 1), cap="Always extend the closest point first",
         text="The rule is simple: always extend the point that is closest in minutes. Purple is near, yellow is far. The moment the spill "
              "touches the destination, the white line is guaranteed to be the fastest route: forty three minutes, after exploring about "
              "eight thousand points. Technically, this is Dijkstra's algorithm, with a priority queue."),
    dict(ch="Question 1 of 5: how fast can we get there?", lesson="blown", p=(0, 1), focus=["X1", "X2"], cap="Blow two bridges, search again",
         text="Now we blow up the two bridges in Arcis, the red crosses, and search again. The spill has to go much further, almost nineteen "
              "thousand points, and finds a detour over a bridge upstream: sixty four minutes. In a fraction of a second, the planner knows "
              "the price of losing those bridges: twenty one extra minutes."),
    # ---------------- Q2
    dict(ch="Question 2 of 5: where is the enemy?", lesson="truth", p=(0, 0.6), cap="The truth: every unit, minute by minute",
         text="Question two: where is the enemy? Here is what really happens, minute by minute. Our units drive to the bridges, and Red's "
              "three units drive from Vitry towards theirs. This is the answer key. Our headquarters never sees it directly."),
    dict(ch="Question 2 of 5: where is the enemy?", lesson="reports", p=(0.2, 0.75), cap="We only see what soldiers report",
         text="What the headquarters actually gets are messages from soldiers: these yellow pins. They arrive late, the positions are a few "
              "hundred metres off, the counts are wrong, and a few are ghosts that report nothing real. Forty three messages in this run."),
    dict(ch="Question 2 of 5: where is the enemy?", lesson="fusion", p=(0.45, 0.8), cap="Which messages belong together?",
         text="The computer has to decide which messages are about the same enemy column. Each ring is a guess: an enemy column is probably "
              "here. The pale circle around it is the gate. A new message inside the circle may belong to that column. Outside, it cannot, "
              "because a column cannot teleport."),
    dict(ch="Question 2 of 5: where is the enemy?", lesson="fusion", p=(0.6, 1), cap="Two messages confirm. Ghosts fade.",
         text="A message inside the gate nudges the ring halfway towards where it was seen. One message alone stays a dashed maybe; a second "
              "one confirms it. Ghost messages stay alone and fade away. In the end, forty three messages become exactly two confirmed enemy "
              "columns: one for each Red unit our soldiers saw."),
    dict(ch="Question 2 of 5: where is the enemy?", lesson="fusion", p=(0, 0.5), panel=True, cap="Six versions to get it right",
         text="Getting this right took six versions. The first one created no columns at all. Each fix came from measuring a failure: "
              "duplicate messages are normal, columns stop at bridges, and the gate needs a maximum size, or ghosts confirm each other. "
              "Measure, find the cause, change one thing, measure again."),
    # ---------------- Q3
    dict(ch="Question 3 of 5: who should go where?", lesson="assign", p=(0, 0.5), panel=True, cap="Minutes from every unit to every task",
         text="Question three: who should go where? The table shows how many minutes each of our units needs to reach each task. Hatched cells "
              "are not allowed: the recce unit watches, it does not hold bridges. The computer tries every legal combination, picks the one "
              "where the last unit arrives earliest, and proves that no better one exists."),
    dict(ch="Question 3 of 5: who should go where?", lesson="why", p=(0, 0.5), panel=True, focus=["sommesous", "X1"], cap="The slowest unit takes the nearest bridge",
         text="And it found something a tired planner might miss. The armour is the slowest unit. Sent to the far bridge at Brienne, it would "
              "need ninety six minutes. Sent to the nearest bridge, at Arcis, it frees the faster battalions for the far jobs."),
    # ---------------- Q4
    dict(ch="Question 4 of 5: will it survive bad luck?", lesson="montecarlo", p=(0, 0.4), panel=True, cap="One thousand replays of the day",
         text="Question four: will the plan survive bad luck? We replayed the day a thousand times, with late starts, slow roads, and an "
              "enemy that is early or fast. Each dot is one replay. Green means we reached the Brienne bridge first, or were strong enough "
              "to win anyway."),
    dict(ch="Question 4 of 5: will it survive bad luck?", lesson="montecarlo", p=(0.4, 0.8), panel=True, cap="89 % against 48 %",
         text="The computer's plan holds the bridge in eighty nine percent of the replays. The obvious plan, armour to Brienne, only in forty "
              "eight percent. The difference is margin: the battalion arrives thirty seven minutes before the enemy, the armour only fourteen."),
    # ---------------- Q5
    dict(ch="Question 5 of 5: did we forget something?", lesson="validate", p=(0, 0.5), panel=True, cap="Every rule becomes a check",
         text="Question five: did we forget something? Every rule becomes a check. And two checks fail. The mission says: stop Red at both "
              "Brienne bridges. But the plan only covered one of them, X five. Bridge X six had nobody."),
    dict(ch="Question 5 of 5: did we forget something?", lesson="hole", p=(0.15, 0.4), focus=["X6"], panel=True, cap="Red's recce crosses X6 unopposed",
         text="Red's recce company drives straight to X six and crosses at minute seventy eight, unseen. Could anyone get there first? Only our "
              "own recce, two minutes ahead, and it is not allowed to hold a bridge. A real staff must catch this before the operation. "
              "Here, the engine caught it."),
    dict(ch="Question 5 of 5: did we forget something?", lesson="options", p=(0, 1), panel=True, cap="Four ways out, measured",
         text="So the engine measured four ways out. Accept the risk: X six is lost every time. Move our recce to watch it: we see the enemy, "
              "but still lose the bridge. Re-task: a battalion attacks the small recce at X six and wins, and the engineers blow the X five "
              "bridge, but only half the time in time. Send the engineers thirty minutes early, and the whole mission holds in ninety four "
              "percent of the replays."),
    # ---------------- outro
    dict(ch="Staff in a box", lesson="end", p=(0, 0.6), cap="The model drafts. The maths decides.",
         text="That is the whole engine. Routes, the enemy picture, the plan, the bad luck test and the missing bridge were all calculated: "
              "exact, fast, and explainable line by line. An AI model is useful at the edges, reading radio messages and writing the order. "
              "But the decisions come from maths you can defend, line by line."),
]


def jobs(english_only):
    out = []
    for i, s in enumerate(SEG):
        t = s["text"]
        if english_only:
            for a, b in PHONETIC:
                t = t.replace(a, b)
        out.append({"name": f"s_{i:02d}", "text": t})
    return out
