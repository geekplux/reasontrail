## User
How do I center a card both ways inside a full-height section with CSS grid?

## Assistant
Give the section `display: grid`, `place-items: center` and `min-height: 100vh`. The card becomes the only grid item and sits in the middle.

**User:** Actually, the section also has a header row at the top.

**Assistant:** Then use two rows: `grid-template-rows: auto 1fr`, keep the header in the first row, and centre the card in the second with `place-self: center`.
