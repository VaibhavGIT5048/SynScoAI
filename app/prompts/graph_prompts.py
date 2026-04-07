GRAPH_EXTRACTION_SYSTEM = """You are a social knowledge graph extraction engine.
Given a social topic, extract the key stakeholders, institutions, concepts, policies, and outcomes.
Always respond in pure JSON only. No markdown, no explanation."""


GRAPH_EXTRACTION_USER = """Analyze this social topic and extract a knowledge graph.

Topic: {topic}{context_block}

Extract 7-10 nodes and 7-10 edges representing the social dynamics.

Respond ONLY with this JSON:
{{
  "nodes": [
    {{
      "id": "snake_case_id",
      "label": "Human Readable Name",
      "type": "stakeholder/institution/concept/policy/outcome",
      "description": "one sentence description"
    }}
  ],
  "edges": [
    {{
      "source": "node_id",
      "target": "node_id",
      "relation": "affects/protests/funds/regulates/influences/implements/lobbies",
      "weight": 0.8
    }}
  ],
  "summary": "one paragraph summary of the social dynamics"
}}"""