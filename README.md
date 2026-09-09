# Divorce — uncontested divorce paperwork help for Texas & Oklahoma ($30 flat)

A guided questionnaire that produces a printable filing organizer for uncontested, no-children divorces. All data stays local to the browser — nothing you enter ever leaves your machine. Checkout is not open yet; when it is, the price is a $30 flat fee, and court filing fees are separate.

This app is not a law firm and does not provide legal advice. It does not file anything with any court. Court forms and rules change, and Oklahoma clerks cannot provide divorce forms — always verify the organizer against your county clerk's current requirements before filing. If your situation involves children, contested property, abuse, or anything beyond a simple uncontested split, talk to a licensed attorney.

Hmmm... we may need to store data... I need to be able to sign up as me, and send a link to my spouse for them to view the information, fill their side out, and accept certain statements. Perhaps suggest edits, and have it go back and forth until both in agreement. I need it secure. I don't want to host things i have no money for now...

## Roadmap

- [ ] State picker (Texas / Oklahoma) driving per-state filing instructions
- [ ] Guided questionnaire: eligibility screen (uncontested, no minor children, property already divided)
- [ ] Local-first form engine: answers held in browser state / localStorage, zero network transmission
- [ ] Printable filing organizer (print CSS, per-state courthouse instructions)
- [ ] Spouse collaboration: secure share link so both parties can review, edit, and accept statements (see privacy note below)
- [ ] Payment for the $30 order (transaction history is the only thing DOGS stores)
- [ ] Expand beyond uncontested no-children cases

## Privacy model

All interactive form data stays local to the browser. If checkout opens, the only database DOGS keeps for this app is order transaction history. If spouse collaboration is added, it must keep that promise — e.g. client-side encrypted payloads (keys in URL fragments, never sent to a server) or encrypted blobs where DOGS cannot read the contents.

## Legal disclaimer

This app prepares paperwork; it is not a law firm and provides no legal advice. Divorce law and court forms change — verify the generated forms against current Texas and Oklahoma court requirements before filing. If your situation involves children, contested property, abuse, or anything beyond a simple uncontested split, talk to a licensed attorney.