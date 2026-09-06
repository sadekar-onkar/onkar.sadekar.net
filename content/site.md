---
# Everything global lives here. Edit, commit, push — the site rebuilds itself.

name: Onkar Sadekar
short_name: O. Sadekar          # how your name appears in author lists (gets bolded)
title: Onkar Sadekar — Network scientist
description: >-
  Onkar Sadekar is a postdoctoral researcher at the University of Zurich studying
  evolutionary game theory, cultural evolution, and human behaviour.
base_url: https://onkar.sadekar.net

eyebrow: Network science · Zürich
role: Postdoctoral Researcher
department: Department of Evolutionary Anthropology
institution: University of Zürich, Switzerland
email: sadekaronkar@gmail.com

# Files: drop replacements into files/ with these names. Nothing else to change.
photo: photo.jpg
cv: cv.pdf

news_on_home: 6

# Live workshop voting. `api` is the base URL of the Cloudflare Worker in
# workshop-api/ — the ONE external service, and the only third-party request
# the site ever makes. It is used by vote.html and wsadmin.html, and by
# workshop.html only until content/workshop.json is committed.
# Leave `api` empty to switch the whole thing off; the pages then say so.
workshop:
  api: ""


# Drifting particle-network background (the particles.js look).
#   scope:  all | home | off
#   count:  0 = scale automatically to the viewport (recommended)
#   speed:  drift speed; 0.32 is a slow, calm drift
#   grab:   true = the cursor pulls links toward nearby particles
# Sections with a soft background deliberately cover it, so the effect
# shows through the open bands rather than sitting behind dense text.
particles:
  scope: all
  count: 0
  link_distance: 100
  speed: 0.1
  grab: true
  opacity: 0.4
  opacity_dark: 0.7

# The workshop voting screens (vote.html, wsadmin.html) are deliberately NOT
# here: they are noindex, live-only, and would leave a dead nav item behind.
# Uncomment the Workshop line below once content/workshop.json exists — until
# then the page is real but empty, and there is no reason to advertise it.
nav:
  - {label: Home,          url: index.html}
  - {label: Research,      url: research.html}
  - {label: Publications,  url: publications.html}
  - {label: Collaborators, url: collaborators.html}
  - {label: Talks,         url: talks.html}
  - {label: Code,          url: code.html}
  - {label: CV,            url: cv.html}
# - {label: Workshop,      url: workshop.html}

links:
  - {label: Google Scholar, url: "https://scholar.google.com/citations?user=wRgJdSoAAAAJ"}
  - {label: GitHub,         url: "https://github.com/sadekar-onkar"}
  - {label: arXiv,          url: "https://arxiv.org/a/sadekar_o_1"}

contact:
  - {label: Email,   icon: email,   url: "mailto:sadekaronkar@gmail.com", text: sadekaronkar@gmail.com}
  - {label: Scholar, icon: scholar, url: "https://scholar.google.com/citations?user=wRgJdSoAAAAJ", text: Google Scholar profile}
  - {label: GitHub,  icon: github,  url: "https://github.com/sadekar-onkar", text: sadekar-onkar}
  - {label: arXiv,   icon: arxiv,   url: "https://arxiv.org/a/sadekar_o_1", text: Preprints}



collab_lede: >-
  Nothing here was done alone. These are the people I have written papers with,
  and what we worked on together.
collab_description: The people Onkar Sadekar has written papers with.

# Optional: give a collaborator a profile link. Left empty on purpose —
# filling these in with guesses risks linking to the wrong person.
#   profiles:
#     F. Battiston: "https://example.org/"
profiles: {}
---
