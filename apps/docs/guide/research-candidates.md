# Research Candidates

This path is for, "Tell me more about the people running."

## Default tool

- [`politiclaw_research_candidate`](../reference/generated/tools/politiclaw_research_candidate)

Use it first for a single candidate's FEC-backed finance summary and attached bio context. Finance totals come from FEC OpenFEC (tier 1, dollar amounts only). Bio narrative defaults to a tier-5 LLM web-search adapter and is downgraded to tier 1 or 2 only when every citation is a primary government or neutral civic source — useful context, but not the same source class as the finance numbers.

## Focused follow-ups

- [`politiclaw_research_challengers`](../reference/generated/tools/politiclaw_research_challengers) for an incumbent-versus-challengers comparison across stored races
- [`politiclaw_prepare_me_for_my_next_election`](../reference/generated/tools/politiclaw_prepare_me_for_my_next_election) when candidate research is only one part of a broader ballot-prep answer
- [`politiclaw_explain_my_ballot`](../reference/generated/tools/politiclaw_explain_my_ballot) for contest framing without dropping into per-candidate finance detail
