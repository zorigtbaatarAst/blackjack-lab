# Blackjack Lab

A solo blackjack game on Usion that doubles as a basic-strategy trainer: players play hands for chips, drill decisions against the book, and see where they go wrong.

## Table

**Shoe**:
The six shuffled decks cards are dealt from during Play.
_Avoid_: Deck (a deck is one of the six), pack

**Cut card**:
The point, three quarters through the Shoe, after which the Shoe is reshuffled at the end of the current Round.

**Round**:
One cycle of Bet → deal → player turn → dealer turn → Settlement.
_Avoid_: Game, hand (a Round can hold several Hands)

**Hand**:
One set of cards played as a unit; a Round starts with one player Hand and can grow to four through Splits.

**Upcard**:
The dealer's face-up card, the only dealer card visible while the player acts.

**Hole card**:
The dealer's face-down card.

**Peek**:
The dealer checking the Hole card for Blackjack when the Upcard is an ace or ten-value card, before the player acts.

**Blackjack**:
An ace and a ten-value card as the first two cards of an unsplit Hand; pays 3:2.
_Avoid_: Natural, 21 (a three-card 21 is not a Blackjack)

**Bust**:
A Hand whose total exceeds 21.

**Push**:
A Settlement where player and dealer tie and the Bet is returned.
_Avoid_: Tie, draw

## Hand classes

**Hard total**:
A Hand's total where no ace is counted as 11.

**Soft total**:
A Hand's total where one ace is counted as 11 without Busting.

**Pair**:
A two-card Hand of equal rank that may be Split; all ten-value cards count as the same rank.

## Actions

**Action**:
What the player does with a Hand: Hit, Stand, Double, or Split. Surrender and insurance do not exist in this game.
_Avoid_: Move, play

**Double**:
Doubling the Bet on a two-card Hand in exchange for exactly one more card.

**Split**:
Separating a Pair into two Hands, each with its own Bet equal to the original.

## Money

**Chips**:
Free play currency with no real-world value; never Usion wallet credits.
_Avoid_: Credits, coins, money

**Bankroll**:
The player's current Chip balance.

**Bet**:
The Chips staked on a Hand, between the table minimum (10) and maximum (500).
_Avoid_: Wager, stake

**Starting chips**:
The Bankroll the player chose to start with (500, 1,000, 5,000 or 10,000); every Refill tops up to it.

**Refill**:
Resetting the Bankroll to the player's Starting chips when it falls below the table minimum.

**Settlement**:
Paying out or collecting every Bet in a Round once the dealer's turn ends; the only moment the Bankroll changes durably.

## Strategy

**Book**:
The basic strategy for this game's fixed table rules.
_Avoid_: Optimal play, correct answer, the chart (the Strategy chart is how the Book is written down)

**Strategy chart**:
The Book laid out as a grid of Chart cells.

**Chart cell**:
One Hand class (a Hard total, Soft total, or Pair) against one Upcard; the unit accuracy is measured in.

**Book action**:
The Action the Book prescribes for a Situation, taking into account whether Double or Split is still allowed.

**Situation**:
A player Hand plus a dealer Upcard at the moment an Action is required.

**Decision**:
The Action a player chose in a Situation, recorded against its Chart cell.

**Mistake**:
A Decision that differs from the Book action.

**Rule of thumb**:
A short, human-readable reason covering a region of the Strategy chart, shown after a Mistake.
_Avoid_: Explanation, tip

**Close call**:
A Chart cell whose Book action differs from a neighbouring cell's in the same table (hard, soft, or pairs); the decisions players most often get wrong.
_Avoid_: Hard hand, tricky hand (a "hard hand" is a Hard total)

**Pending cell**:
A Chart cell with a Mistake the player has not yet corrected by two consecutive Book-matching Decisions there.

## Counting

**Hi-Lo**:
The card-counting system Train teaches.

**Count value**:
A card's Hi-Lo value: +1 for 2–6, 0 for 7–9, −1 for ten-value cards and aces.
_Avoid_: Tag, card value (a card's value is its points in a Hand)

**Running count**:
The sum of the Count values of every card seen since the Shoe was shuffled.

**Discard tray**:
Where dealt cards go; its height shows how many decks have been dealt since the shuffle.

**Decks left**:
Six minus the decks in the Discard tray, read to the nearest half deck.

**True count**:
The Running count divided by the Decks left, dropping the fraction.

**Bet ramp**:
The Bet for a True count: the True count minus one, in units of the table minimum, at least 1 and at most 8.

**Count check**:
The questions the Count drill asks at a random point every 1–4 rounds: the Running count, then the True count, then the Bet.

## Modes

**Play**:
Real Rounds for Chips against the dealer.

**Train**:
Where the player practises Decisions without Chips; holds the Drills.

**Drill**:
One of Train's exercises. The Weighted and Mistakes drills play Training hands, each Decision by Decision until it's over; the Values and Count drills practise counting.

**Weighted drill**:
The default Drill: each Training hand starts from a Situation biased toward Soft totals, Pairs and Close calls.

**Mistakes drill**:
A Drill whose Training hands start only from the player's Pending cells.
_Avoid_: Review mode

**Training hand**:
A Round played in Train without Chips: a weighted start, every Decision graded, then the dealer plays out and the result shows.
_Avoid_: Practice round, drill round

**Training Shoe**:
The six-deck Shoe a Drill deals from after a Training hand's start; separate from the Play Shoe.

**Values drill**:
A 30-second sprint: the player gives as many cards their Count value as they can.

**Count drill**:
Rounds dealt from the Count Shoe and played by the Book while the player keeps the Running count and answers Count checks.

**Count Shoe**:
The six-deck Shoe the Count drill deals from; separate from the Play Shoe and the Training Shoes.

**Coach**:
The Book check that runs on every Decision in Play and flags Mistakes after the Action is taken.

**Hint**:
The Coach showing the Book action before the player acts; hinted Decisions are not recorded.

**Guide**:
The in-app manual: how to play, this table's rules, basic strategy with the Strategy chart, card counting, and using the app.
_Avoid_: Help page, docs

**Tour**:
The welcome slides a first-time player sees before choosing Starting chips.

**Looked up**:
A Hand whose player opened the Guide while a Decision was waiting. Its remaining Decisions are graded but, like hinted ones, not recorded and never change the Streak.

**Improve**:
Where the player sees their accuracy, Mistakes, Play results, and rank.

## Progress

**Streak**:
The count of consecutive Book-matching Decisions in the Weighted drill; a Mistake ends it.

**Best streak**:
The player's longest Streak; the metric on the leaderboard.

**Best sprint**:
The player's highest Values drill score; kept like the Best streak, but not on the leaderboard.

**Guest**:
A Usion visitor who is not logged in; can play and train but has no rank.
