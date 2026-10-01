# PolitiClaw

The civic context in which a person declares positions on policy issues and compares those positions to how their representatives vote.

## Language

### Declared positions

**Issue stance**:
A user's declared position on one policy issue: support, oppose, or neutral, with a weight.
_Avoid_: value, preference, position

**Stance signal**:
A user's recorded reaction to one bill: agree, disagree, or skip. It may apply to one issue stance or to every issue stance that bill matches. When a signal and a bill direction disagree, the signal is the position that alignment uses.
_Avoid_: vote, quick vote, rating, direction

**Bill direction**:
Whether a bill's text advances or obstructs one issue stance.
_Avoid_: stance, signal

### Representative comparison

**Roll call**:
One question put to the House or Senate, together with its result.
_Avoid_: vote, ballot

**Vote**:
A representative's Yea, Nay, Present, or Not Voting on one roll call. Present and Not Voting stay out of alignment.
_Avoid_: stance signal, quick vote, ballot

**Alignment**:
How often a representative's votes match the position implied by the user's stance signals on those bills.
_Avoid_: accountability

**Aligned**:
A representative's vote on the same side as the position the user's stance signal implies for that bill.
_Avoid_: supportive, in favor

**Conflicted**:
A representative's vote on the opposite side from the position the user's stance signal implies for that bill.
_Avoid_: misaligned, against the issue

**Accountability mode**:
The user's chosen level of follow-up when alignment crosses a threshold: look it up themselves, get a nudge, or receive a letter produced without being asked.
_Avoid_: accountability, monitoring, outreach

### Elections

**Ballot**:
The contests a user marks in an election.
_Avoid_: vote, roll call, stance signal

### Watching

**Monitoring mode**:
The user's chosen cadence for scheduled watching.
_Avoid_: action, action only

**Prompting**:
The user's on/off choice for whether a qualifying change is stored as an offer.
_Avoid_: action prompting, action

**Trigger**:
The reason a change qualified to become an offer. A trigger can qualify without an offer being stored.
_Avoid_: action, action moment, decision point

**Offer**:
A proposal stored because a trigger qualified. It can exist before any letter, call script, or reminder is attached.
_Avoid_: action, action moment, package, letter, outreach, reminder

**Reminder**:
A checklist stored for the user and anchored to a bill, a scheduled event, or an election date. It can exist with no offer attached.
_Avoid_: offer, outreach, letter, ballot

### Outreach

**Letter**:
Text stored for the user to send to a representative about one issue stance.
_Avoid_: offer, outreach, call script

**Call script**:
Lines stored for the user to read when calling a representative.
_Avoid_: letter, offer

**Outreach**:
A letter or a call script the user delivers themselves. An outreach offer can exist before either is stored.
_Avoid_: offer, sending
