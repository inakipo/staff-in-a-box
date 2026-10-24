[out:json][timeout:180];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|secondary_link)$"](48.35,3.90,49.00,4.70);
);
out geom tags;
