# Divorce - a way to get divorced in Texas or Oklahoma for $30

We prepare all the forms, you print them out and go together to the courthouse. All the data stays local to the browser. The only database DOGS has for this app is exclusively for order transaction history. No information entered into any of the interactive forms leaves your machine.

This apps aims to make uncontested divorces easy as pie. Eventually we may assist with all types of divorces and situations. But for now, if both parties are in good agreement, have divided their possessions by themselves, and have no children together, they should be able to fill out simple information on this website, and get printable forms valid in all Oklahoma and Texas courthouses.

Hmmm... we may need to store data... I need to be able to sign up as me, and send a link to my spouse for them to view the information, fill their side out, and accept certain statements. Perhaps suggest edits, and have it go back and forth until both in agreement. I need it secure. I don't want to host things i have no money for now...

## Roadmap

- [ ] State picker (Texas / Oklahoma) driving per-state form content and filing instructions
- [ ] Guided questionnaire: eligibility screen (uncontested, no minor children, property already divided)
- [ ] Local-first form engine: answers held in browser state / localStorage, zero network transmission
- [ ] Printable form packet generation (print CSS, per-state courthouse instructions)
- [ ] Spouse collaboration: secure share link so both parties can review, edit, and accept statements (see privacy note below)
- [ ] Payment for the $30 order (transaction history is the only thing DOGS stores)
- [ ] Expand beyond uncontested no-children cases

## Privacy model

All interactive form data stays local to the browser. The only database DOGS keeps for this app is order transaction history. If spouse collaboration is added, it must keep that promise — e.g. client-side encrypted payloads (keys in URL fragments, never sent to a server) or encrypted blobs where DOGS cannot read the contents.

## Legal disclaimer

This app prepares paperwork; it is not a law firm and provides no legal advice. Divorce law and court forms change — verify the generated forms against current Texas and Oklahoma court requirements before filing. If your situation involves children, contested property, abuse, or anything beyond a simple uncontested split, talk to a licensed attorney.