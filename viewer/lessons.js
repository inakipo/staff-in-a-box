// The guided tour. Each lesson: what you see (plain), why it is that way, and the technical detail.
// "show" tells the viewer which layers and animation to use; numbers come from data.js where marked {{...}}.
window.LESSONS = [
  {
    id: "intro", title: "The engine, not the chatbot", show: { layers: ["terrain", "roads", "rivers", "places"], camera: "overview" },
    plain: "Everything you will see is deterministic: the same input always gives the same output, and every answer can be traced to a rule or a number. No AI model is involved in any of it.",
    why: "A commander must be able to ask 'why?' and get a reason, not a vibe. Deterministic methods also run in milliseconds on a laptop with no internet.",
    tech: "Four tools: shortest path (Dijkstra), report fusion (gating, filtering, re-identification), optimisation (constraint programming with OR-Tools CP-SAT), and Monte Carlo simulation with fixed seeds."
  },
  {
    id: "terrain", title: "Real ground", show: { layers: ["terrain", "rivers", "places"], camera: "low-south" },
    plain: "This is the real Champagne plain, from 73 m in the river valleys to 255 m on the chalk plateau. The height is stretched 12 times so you can see it; in reality it is very flat.",
    why: "Valleys channel movement and rivers are obstacles, which is why the bridges over the Aube are the key terrain of the whole exercise.",
    tech: "Elevation from the AWS open terrain tiles (terrarium PNG, zoom 11, about 50 m per pixel). Height in metres = R x 256 + G + B / 256 - 32768, read with bilinear interpolation between pixels."
  },
  {
    id: "graph", title: "Roads become a graph", show: { layers: ["terrain", "roads", "rivers", "crossings", "places"], camera: "overview" },
    plain: "Every road from OpenStreetMap becomes a network of 54,077 points joined by 55,082 segments. Each segment knows how many minutes it takes to drive.",
    why: "Once roads are a graph, 'how do I get there fastest?' becomes a maths problem with an exact answer.",
    tech: "Edge cost = 60 x km / min(road speed, unit speed). Planning road speeds for a column: motorway 60, primary 45, secondary 35, tertiary 25 km/h. A mechanised battalion is capped at 35 km/h, armour at 30."
  },
  {
    id: "dijkstra", title: "The ripple: Dijkstra's algorithm", show: { layers: ["terrain", "roads", "rivers", "crossings", "places"], anim: "ripple-normal", camera: "arcis" },
    plain: "Watch the search spread from Camp de Mailly like a ripple: it always extends the point that is closest in minutes. When the ripple touches the destination, that route is the fastest. {{dijkstra.normal.settled}} points explored, {{dijkstra.normal.minutes}} minutes.",
    why: "Because travel times are never negative, the first time the ripple reaches a point, nothing found later can beat it. That is why the answer is guaranteed, not guessed.",
    tech: "Priority queue keyed by minutes from the start. Pop the smallest, mark it settled, relax its neighbours (new = d + edge cost; keep it if smaller). Complexity O((V + E) log V); here a few milliseconds."
  },
  {
    id: "blown", title: "Blow the bridges, run it again", show: { layers: ["terrain", "roads", "rivers", "crossings", "places"], anim: "ripple-blown", camera: "arcis" },
    plain: "Cut the two town bridges at Arcis and rerun. The ripple has to spread much further, {{dijkstra.blown.settled}} points, and finds a detour over the D65 bridge upstream: {{dijkstra.blown.minutes}} minutes instead of {{dijkstra.normal.minutes}}.",
    why: "A blown bridge is just deleted segments. The planner instantly knows the price of losing a bridge: about 21 extra minutes for this column.",
    tech: "Every bridge segment within 300 m of the crossing is removed (both carriageways of a dual road, slip roads). Same algorithm, different graph. The extra search is the cost of the detour being far away."
  },
  {
    id: "truth", title: "Ground truth: the answer key", show: { layers: ["terrain", "roads", "rivers", "crossings", "places", "units", "routes"], anim: "play-truth", camera: "overview" },
    plain: "Each unit drives its fastest route minute by minute. Blue moves to the bridges; Red comes from Vitry-le-François. This is the truth that our system never sees directly.",
    why: "Knowing the truth lets us grade everything automatically: how close our picture of the enemy is to where the enemy really was.",
    tech: "Position at minute t = linear interpolation along the route polyline, using the cumulative minute stored at every point. Departures and speeds are inputs, so the same plan always gives the same movie."
  },
  {
    id: "reports", title: "What the soldiers report", show: { layers: ["terrain", "roads", "rivers", "crossings", "places", "units", "reports"], anim: "play-reports", camera: "overview" },
    plain: "Blue units only see Red within a few kilometres, and they report late, with position errors, wrong counts, sometimes the wrong vehicle type. A few reports are pure ghosts. {{reports.count}} reports in this run, {{reports.ghosts}} of them ghosts.",
    why: "This is what a headquarters actually receives. If our method works on messy reports with a known answer, we can trust it on real ones.",
    tech: "Detection range 8 km for recce, 5 km for others; a report with probability 0.08 per minute while in range; position noise 200 to 400 m (Gaussian); delay 2 to 15 min; size x 0.6 to 1.3; 10 % misidentified; 4 random ghosts. Seed 2026."
  },
  {
    id: "radio", title: "Reading the radio", show: { layers: ["terrain", "roads", "rivers", "crossings", "places", "radio"], panel: "radio", camera: "east" },
    plain: "Reports arrive as messy radio text in French and English. A 4B language model running on this laptop, offline, only reads each message into fields. Code turns the location into a map position and checks every field against the text.",
    why: "The model is good at language and bad at certainty, so it never decides anything. When it invents a time that is not in the message, the code guard drops it. Yellow pins are where the code placed each report: 50 to 210 m from the real vehicles.",
    tech: "Qwen3.5-4B, 4-bit, MLX; LoRA fine-tuned for 200 steps on 3,001 generated messages (rented A40, MLX CUDA backend; the same adapter loads on the Mac). Honest test: messages rewritten by a different model, kept only if every number and landmark survived. On the Mac: about 3 s per message, 0.63 GB."
  },
  {
    id: "fusion", title: "From messages to enemy columns", show: { layers: ["terrain", "roads", "rivers", "places", "reports", "tracks", "gates", "links"], anim: "play-fusion", panel: "fusion-one", camera: "east" },
    plain: "Every message is either about a column we already know, or about a new one. Rings are columns the computer believes in, pale circles are their gates, and thin lines show which message joined which column.",
    why: "No understanding needed: only where, when and how fast. That makes every decision explainable, and ghost messages die out on their own because nothing ever confirms them.",
    tech: "Prediction with 15-minute coasting; gate min(2.5 km + 1 km per 10 min, 5 km); 60 km/h plausibility; alpha-beta update (0.5, 0.2); confirmation at 2 reports; re-identification by reachability, type and size; merges keep the newest sighting. Not one-to-one (Hungarian) matching: human reports duplicate. Scoreboard: docs/fusion-log.md."
  },
  {
    id: "assign", title: "Optimisation: who does what", show: { layers: ["terrain", "roads", "rivers", "crossings", "places", "units", "assign-arrows"], panel: "assign-table", camera: "overview" },
    plain: "Four tasks, four fighting units. The solver tries every combination that follows the rules and returns the one where the last unit arrives earliest. It answers in {{assign.best.wall_ms}} ms and proves no better plan exists.",
    why: "Rules a human applies by habit become explicit: recce screens and does not hold ground, every task gets exactly one unit, nobody does two jobs, and every unit keeps 20 % fuel. The brigade also has an engineer company and a logistics battalion at the camp; this first plan only gives tasks to the four fighting units.",
    tech: "CP-SAT model: a yes/no variable per (unit, task); ExactlyOne per task; AtMostOne per unit; ineligible pairs fixed to 0; minimise 1000 x latest arrival + total minutes. Single-threaded so the answer never changes. Status OPTIMAL = proof of optimality."
  },
  {
    id: "why", title: "Why the slowest unit takes the nearest bridge", show: { layers: ["terrain", "roads", "rivers", "crossings", "places", "units", "assign-arrows"], panel: "assign-why", camera: "overview" },
    plain: "The armour is the slowest unit. If it went to Brienne it would need 96 minutes; a mechanised battalion needs 73. Sending it to the closest bridge at Arcis frees the faster mechanised battalions for the far jobs. A tired planner might do the obvious thing instead.",
    why: "The solver does not have intuition; it has the whole table. The non-obvious choice is the one that keeps everyone on time.",
    tech: "Explanation by counterfactual: for each task, force the fastest unit onto it and re-solve; compare the latest arrival and total time with the optimum."
  },
  {
    id: "validate", title: "The validator: unit tests for a plan", show: { layers: ["terrain", "roads", "rivers", "crossings", "places", "units"], panel: "checks", camera: "overview" },
    plain: "Every rule becomes a check that passes or fails with a reason: the mission's bridges, deadlines, fuel reserve, and who wins the race to each bridge. Two checks fail: nobody is assigned to deny bridge X6, so the Red recce crosses it unopposed.",
    why: "The checks are written against the MISSION, not against the planner's task list. My first validator checked the task list I wrote, passed 13 of 13, and missed that the mission names X6. Tests must encode the spec.",
    tech: "Race rule: if Blue arrives first it defends, and the defence holds while the attacker ratio is below 3:1. If Red arrives first, Blue must attack and needs 2:1 against a hasty defence. Engineers must have charges ready (arrival + 20 min) before Red arrives. Ratios use vehicle counts."
  },
  {
    id: "montecarlo", title: "Monte Carlo: does the plan survive bad luck?", show: { layers: ["terrain", "places", "crossings"], panel: "race", camera: "brienne" },
    plain: "We ran each plan 1,000 times with late starts, slow roads and a Red force that is early or fast. Each dot is one run: when Blue reached the Brienne bridge vs when Red did. Dots above the line, Blue got there first. Solver plan: {{mc.solver}} % hold the bridge. Intuitive plan: {{mc.intuitive}} %.",
    why: "A plan is only as good as its worst likely day. The solver's plan is almost twice as robust, and the failures name their cause.",
    tech: "Seeded random perturbations: Blue start delay ~ exponential, mean 10 min, capped at 60; Blue speed x 0.75 to 1.0; Red departure +/- 25 min; Red speed x 0.8 to 1.15. Speeds quantised to 5 % so routes come from cache: 1,000 runs in about 2 seconds."
  },
  {
    id: "hole", title: "The hole in the plan", show: { layers: ["terrain", "roads", "rivers", "crossings", "places", "units", "routes"], panel: "mission", anim: "play-truth", camera: "brienne" },
    plain: "The mission says: stop Red crossing at X5 and X6. The first plan only covered X5. Red's recce company drives straight to X6 and crosses at H+{{mission.recce_x6}}, unseen and unopposed. Can any Blue unit get there first? The fastest is our own recce, 2 minutes ahead, and recce is not allowed to hold ground.",
    why: "A real staff must catch this in mission analysis and go back to the commander. Here the engine caught it. The first verdict was 'infeasible, short by 17 minutes', but that came from a bug: the solver and the validator each had their own copy of the race rule, and the copies had drifted apart.",
    tech: "The way out uses a unit the first plan left idle: the engineer company can deny a bridge by demolition, if its charges are ready (arrival + 20 min) before Red arrives. Fix for the bug: one function, race_ok(), used by both. A 40-vehicle battalion arriving 17 minutes after a 6-vehicle recce company still clears the bridge by attacking at 6.7:1 (needs 2:1). With one shared rule the solver finds a plan with no head start."
  },
  {
    id: "options", title: "Four ways out, measured", show: { layers: ["terrain", "roads", "rivers", "crossings", "places", "option-arrows"], panel: "options", camera: "overview" },
    plain: "Each way out runs through the same engine: the checks, 1,000 runs of bad luck, and what our sensors would see. Accepting the risk loses X6 every time. The solver's re-task holds X6 every time but the engineers at X5 are a coin flip. Sending the engineers 30 minutes early makes the whole mission hold in 94 % of runs.",
    why: "This is the 'acceptable' test that only a human can pass. The engine does not choose; it puts a number on every option so the commander chooses with data.",
    tech: "Head start found by search: the smallest engineer lead time, in 5-minute steps, for which ALL checks pass in at least 90 % of 1,000 seeded runs. Fusion column: share of 30 seeded report streams in which each Red unit is tracked by H+150."
  },
  {
    id: "end", title: "The model drafts; the maths decides", show: { layers: ["terrain", "roads", "rivers", "crossings", "places", "units", "tracks"], camera: "overview" },
    plain: "A language model is still useful at the edges: reading messy radio, understanding intent, writing the order, explaining the result. But the decisions you just saw are made by methods that are exact, fast, and explainable.",
    why: "That is what a headquarters can trust, and what you can defend line by line in front of a commander.",
    tech: "Repo: staff-in-a-box (sib/roads, terrain, sim, reports, fusion, assign, validate, montecarlo, export). Everything reruns from scratch in about 6 seconds."
  }
];
