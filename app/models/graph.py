from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from app.config import settings


def validate_topic_text(value: str) -> str:
    normalized = value.strip()
    if len(normalized) < 3:
        raise ValueError("Topic must be at least 3 characters long.")
    if len(normalized) > settings.max_input_chars_topic:
        raise ValueError(
            f"Topic exceeds MAX_INPUT_CHARS_TOPIC ({settings.max_input_chars_topic})."
        )
    return normalized


def validate_context_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    normalized = value.strip()
    if len(normalized) > settings.max_input_chars_context:
        raise ValueError(
            f"Context exceeds MAX_INPUT_CHARS_CONTEXT ({settings.max_input_chars_context})."
        )

    return normalized or None


class AnalyzeRequest(BaseModel):
    topic: str = Field(..., min_length=3)
    context: Optional[str] = None

    @field_validator("topic")
    @classmethod
    def validate_topic(cls, value: str) -> str:
        return validate_topic_text(value)

    @field_validator("context")
    @classmethod
    def validate_context(cls, value: Optional[str]) -> Optional[str]:
        return validate_context_text(value)


class GraphNode(BaseModel):
    id: str
    label: str
    type: str
    description: str


class GraphEdge(BaseModel):
    source: str
    target: str
    relation: str
    weight: float = Field(default=1.0, ge=0.0, le=1.0)


class AnalyzeResponse(BaseModel):
    topic: str
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    summary: str


class Agent(BaseModel):
    id: str
    name: str
    type: str
    represents: str

    # Core Identity
    role: str                        # Economic Analyst / Policy Critic / Social Advocate etc
    personality: str
    goal: str
    stance: str

    # Intelligence Layer
    reasoning_style: str             # analytical / emotional / adversarial / diplomatic
    knowledge_domain: List[str]      # e.g. ["fiscal policy", "inflation", "GDP"]
    skills: List[str]                # subset of your skills list
    bias: str                        # what they tend to favor
    confidence: float = 0.7          # 0-1 how certain they are
    risk_tolerance: str              # conservative / moderate / aggressive

    # Memory & State
    memory: List[str] = []
    relationships: List[str] = []

    # Reasoning outputs (filled during simulation)
    assumptions: List[str] = []
    concerns: List[str] = []


class AgentRequest(BaseModel):
    topic: str
    context: Optional[str] = None

    @field_validator("topic")
    @classmethod
    def validate_topic(cls, value: str) -> str:
        return validate_topic_text(value)

    @field_validator("context")
    @classmethod
    def validate_context(cls, value: Optional[str]) -> Optional[str]:
        return validate_context_text(value)


class AgentResponse(BaseModel):
    topic: str
    total_agents: int
    agents: List[Agent]


class SimulationTurn(BaseModel):
    round: int
    agent_id: str
    agent_name: str
    represents: str
    role: str = ""
    stance: str
    message: str
    emotion: str
    action: str
    challenges: List[str] = []       # agent ids this turn directly challenges
    reasoning_chain: str = ""        # short causal chain used


class SimulationRequest(BaseModel):
    topic: str
    context: Optional[str] = None
    rounds: int = Field(default=3, ge=1, le=10)
    agents_per_round: int = Field(default=3, ge=1, le=10)

    @field_validator("topic")
    @classmethod
    def validate_topic(cls, value: str) -> str:
        return validate_topic_text(value)

    @field_validator("context")
    @classmethod
    def validate_context(cls, value: Optional[str]) -> Optional[str]:
        return validate_context_text(value)


class SimulationResponse(BaseModel):
    topic: str
    total_rounds: int
    total_turns: int
    turns: List[SimulationTurn]
    key_tensions: List[str] = []
    dominant_stances: dict = {}


class StakeholderInsight(BaseModel):
    represents: str
    summary: str
    final_stance: str
    influence_score: float


class ReportResponse(BaseModel):
    topic: str
    executive_summary: str
    key_findings: List[str]
    stakeholder_insights: List[StakeholderInsight]
    predicted_outcome: str
    policy_recommendations: List[str]
    conflict_score: float
    consensus_areas: List[str]
    total_turns_analyzed: int


class PipelineRequest(BaseModel):
    topic: str
    context: Optional[str] = None
    rounds: int = Field(default=2, ge=1, le=10)
    agents_per_round: int = Field(default=3, ge=1, le=10)
    agents_per_node: int = Field(default=3, ge=1, le=6)

    @field_validator("topic")
    @classmethod
    def validate_topic(cls, value: str) -> str:
        return validate_topic_text(value)

    @field_validator("context")
    @classmethod
    def validate_context(cls, value: Optional[str]) -> Optional[str]:
        return validate_context_text(value)


class PipelineResponse(BaseModel):
    topic: str
    graph: AnalyzeResponse
    agents: AgentResponse
    simulation: SimulationResponse
    report: ReportResponse