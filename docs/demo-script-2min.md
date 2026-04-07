# SynSoc AI 2-Minute Demo Script

## Demo Goal
Show that users can run a realistic stakeholder simulation from a topic prompt and receive decision-ready insights.

## Live URLs
- Frontend: https://synsoc-ai.netlify.app
- Backend health: https://synsoc-api-production.up.railway.app/health
- Backend docs: https://synsoc-api-production.up.railway.app/docs

## 0:00 to 0:15 - Quick Setup Check
Say:
"This is SynSoc AI. I will run a fast policy simulation from prompt to insights in under two minutes."

Action:
- Open frontend URL.
- Confirm the page loads.

## 0:15 to 0:30 - Explain the Input
Say:
"I will test a real social tension topic: city congestion pricing. SynSoc creates stakeholder agents, runs debate rounds, and summarizes likely outcomes."

Action:
- Go to Simulate page.
- Topic: "Should the city adopt congestion pricing in downtown areas?"
- Context: "Large traffic delays, mixed public opinion, and local business concerns."
- Rounds: 2
- Agents per round: 3
- Agents per node: 3

## 0:30 to 1:15 - Run the Simulation
Say:
"Now the system is extracting the issue graph, generating stakeholder agents, and streaming each turn in real time."

Action:
- Click Run Simulation.
- Highlight live updates:
  - Graph and stakeholder nodes appear.
  - Agent turns stream in timeline.
  - Debate events update as rounds progress.

## 1:15 to 1:45 - Show Outcome Layer
Say:
"Once simulation ends, SynSoc produces structured insights: dominant stances, conflict level, and practical policy recommendations."

Action:
- Open Results view.
- Point out:
  - Executive summary
  - Key findings
  - Stakeholder insights
  - Policy recommendations
  - Predicted outcome

## 1:45 to 2:00 - Close
Say:
"SynSoc AI turns complex public-policy debates into explainable, testable scenarios that teams can use before making real decisions."

Action:
- Optionally show backend health endpoint quickly to reinforce reliability.

## Backup Talking Points
- "The backend API is live and documented via OpenAPI."
- "The frontend is deployed on Netlify and connected to Railway backend services."
- "Cookie consent controls analytics initialization for compliance-sensitive tracking."
