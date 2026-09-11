# Spec: Beginner guide — tour, Guide, and help in Train

Status: done

Vocabulary follows `CONTEXT.md`, including **Guide**, **Tour** and **Looked up**. Builds on `.scratch/blackjack-lab/spec.md` (v1), `.scratch/train-full-hands/spec.md` and `.scratch/card-counting/spec.md`.

## Problem Statement

Blackjack Lab assumes the player already knows blackjack. A beginner who opens it has nothing to explain:

- how the game is played;
- what this table's rules are;
- what the Book or the Strategy chart is;
- why card counting works;
- where anything is in the app.

In Train there's no way to check the rules or the strategy chart without leaving the drill. In the counting drills, a beginner is asked for a Running count without ever being told what it is for.

## Solution

- **Tour:** on first launch, five welcome slides explain the goal of the game and the three tabs, then lead into the Starting-chips picker.
- **Guide:** a **?** button on every screen opens the in-app manual, with five chapters:
  - How to play;
  - This table's rules;
  - Basic strategy, with the full Strategy chart;
  - Card counting, why and how;
  - Using the app.
- **Train buttons:** Drill and My mistakes get **Rules** and **Chart** buttons. Values and Count get **Why & how**, and the counting chapter opens by itself the first time the player visits a counting drill.
- **Looking up:** the Guide can't be used to pad the Streak. Seeing the Basic strategy chapter while a Decision is waiting marks that hand as Looked up, so its remaining Decisions aren't recorded.

## User Stories

1. As a first-time player, I want a short welcome that tells me the goal of blackjack, so that I know what I'm trying to do.
2. As a first-time player, I want the welcome to show me what Play, Train and Improve are for, so that I know where to go.
3. As a first-time player, I want to skip the welcome at any point, so that I can start playing straight away.
4. As a first-time player, I want the welcome to end with choosing my Starting chips, so that I'm ready to play.
5. As a returning player, I don't want to see the welcome again unless I ask for it.
6. As a player, I want to replay the welcome from the Guide, so that I can show it to a friend or refresh my memory.
7. As a beginner, I want a Guide I can open from any screen, so that help is always one tap away.
8. As a beginner, I want the Guide to explain how blackjack is played: card values, soft and hard hands, the deal, Hit/Stand/Double/Split, how the dealer plays, and how hands are paid.
9. As a player, I want the Guide to list this table's exact rules, so that I know what the Book assumes.
10. As a learner, I want the Guide to explain what basic strategy and the Book are and how to read the Strategy chart.
11. As a learner, I want the full-colour Strategy chart and every Rule of thumb in the Guide.
12. As a learner, I want the Guide to explain why card counting works, so that the drills make sense.
13. As a learner, I want the Guide to explain how to count with Hi-Lo: Count values, the Running count, the True count from Decks left, and the Bet ramp.
14. As a player, I want the Guide to explain how to use the app: the tabs, the Hint, Auto bet, the Streak and leaderboard, and the desktop keys.
15. As a learner in a Drill, I want a Rules button that opens how to play and this table's rules.
16. As a learner in a Drill, I want a Chart button that opens the Strategy chart.
17. As a learner in a counting drill, I want a Why & how button that opens the counting chapter.
18. As a beginner opening a counting drill for the first time, I want the counting chapter to open by itself.
19. As a player, I want the automatic counting chapter to open only once, even after a reload.
20. As a competitive player, I want a looked-up hand never to count toward anyone's Streak, so that the leaderboard stays fair.
21. As a learner who looks something up, I want my Streak paused, not broken, and my next hands to count again.
22. As a learner, I want to see clearly when a hand isn't counted because I looked it up.
23. As a learner, I want looking something up mid-hand to still show me whether each Decision was right.
24. As a player, I want reloading not to un-look-up a hand.
25. As a player, I want opening the Guide during a Values sprint to end the sprint, as leaving the drill does.
26. As a player, I want opening the Guide to pause the Count drill and resume it when I close the Guide.
27. As a keyboard player, I want `?` to open the Guide and Esc to close it, and arrow keys to move through the tour.
28. As a phone or tablet player, I want the Train header and its help buttons to fit without the table moving.
29. As a Mongolian speaker, I want the tour and the whole Guide in Mongolian.

## Implementation Decisions

### Tour

- **When it appears:** on first launch, meaning no saved progress. That's exactly when the Starting-chips picker appears today, and the tour comes first.
  - No new saved flag is needed: once chips are chosen, the first save exists.
  - In preview mode (no persistence), the tour shows on every load, as the chip picker does.
- **Slides:**
  1. Welcome and the goal (art: A♠ K♥);
  2. Play (art: chips);
  3. Train (art: a hand with ✓);
  4. Improve (art: a few Strategy chart cells);
  5. Help is always here (art: the ? button).
- **Controls:**
  - Skip, Next → and Back ←. Dots show the position.
  - The last slide's button is **Choose your chips** on first launch, or **Done** when replayed.
  - Skip, Esc and the host's Back button all end the tour early.
  - On first launch, ending the tour opens the chip picker. On a replay, it just closes.
- **Replay:** the Guide's "Using the app" chapter has **Replay the tour**.

### Guide

- **Opening and closing:**
  - It opens from the **?** button in the profile header (any screen, key `?`), or at a given chapter from the Train buttons.
  - The **?** button opens chapter 1.
  - Esc, ✕ and the host's Back button close it.
- **Chapters**, in order and all plain text plus small CSS card examples:
  1. **How to play** (`play`):
     - the goal;
     - card values (2–10 as marked, J Q K = 10, A = 1 or 11) with soft and hard hands (example: A♠ 6♥ = soft 17);
     - Blackjack (example: A♠ K♥);
     - the deal and the Upcard;
     - Hit, Stand, Double and Split;
     - the dealer draws to 17;
     - results: win 1:1, Blackjack 3:2, Push, Bust.
  2. **This table's rules** (`table`):
     - 6 decks, reshuffled at 75%;
     - the dealer stands on all 17s;
     - Blackjack pays 3:2;
     - the dealer peeks for Blackjack;
     - double on any first two cards, and after a split;
     - split to 4 Hands;
     - split aces get one card each;
     - a Hand that reaches 21 stands;
     - no surrender and no insurance;
     - Bets 10–500.
  3. **Basic strategy** (`strategy`):
     - what the Book is (the best move for every Hand against every Upcard, for these rules);
     - how to read the chart: rows are your Hand, columns the Upcard, colours and letters the Action, and Ds means double, otherwise stand;
     - the Strategy chart in full colour, without the player's fade or Mistake rings;
     - every Rule of thumb.
  4. **Card counting** (`counting`):
     - Why:
       - Cards that leave the Shoe change what's left.
       - When many low cards are gone, the Shoe is rich in tens and aces. That means more Blackjacks (paid 3:2), more dealer busts (the dealer must hit 12–16), and doubles on 10 and 11 that land more often.
       - So the player has the edge exactly when the count is high, and bets more then.
       - A full deck counts to 0, so the count starts at 0 after every shuffle.
     - How:
       - Hi-Lo Count values;
       - the Running count;
       - the True count = Running count ÷ Decks left (read the Discard tray), dropping the fraction;
       - the Bet ramp: the True count − 1 units, from 1 to 8;
       - practise speed in Values and the full skill in Count.
     - Note: Chips have no value and this is practice, and in real casinos counting is legal but unwelcome.
  5. **Using the app** (`app`):
     - Play: bet, Deal, Actions, Hint, Auto bet;
     - Train: Drill, My mistakes, Values, Count, the Streak and Looking up;
     - Improve: accuracy, the chart, Mistakes, the leaderboard;
     - the desktop keys;
     - **Replay the tour**.
- **Layout:**
  - A full-screen sheet in the app's theme, with a title bar and ✕, and a row of five chapter chips (scrolling sideways when narrow).
  - The chapter body scrolls. Each opening starts at the top of its chapter.

### Help in Train

- Drill and My mistakes show **Rules**, which opens `play`, and **Chart**, which opens `strategy`.
- Values and Count show **Why & how**, which opens `counting`.
- **First counting visit:** the first time the player enters Values or Count, the Guide opens at `counting` by itself.
  - The "already shown" flag is kept in the shell's UI store, next to the remembered tab, not in the game save.
  - In preview mode it's kept for the session.
- **Train header:**
  - Below a 900px-wide window, it has two rows in every mode:
    - Row 1: the four tabs.
    - Row 2: the help buttons on the left and the mode's two stats on the right.
  - At 900px and wider it's one row: tabs, help buttons, stats.
  - This replaces the 600px breakpoint, so the 560px-wide app on tablets fits.

### Looking up

- **The trigger:** the Basic strategy chapter is the one that shows Book actions, so only it counts. Showing it while a Decision is waiting marks that hand as **Looked up**, from that moment on. That covers opening via Chart, and selecting its chip inside the Guide.
  - The other chapters show no answers and look nothing up.
  - This keeps the automatic counting chapter, and Rules, fair to a hand in progress.
- **What it applies to:** every waiting Decision, meaning Play's Round in its player turn, and every training hand in its player phase (the Weighted and Mistakes hands).
- **Engine event:** one engine event sets the existing `hinted` flag on those Rounds. Play's Actions already skip recording on hinted Rounds.
- **Answers on a looked-up hand:**
  - Grading is unchanged: the feedback shows right or wrong, the Book action and the Rule of thumb, and it is marked not counted.
  - Nothing is recorded: no Chart-cell stats, no Pending changes, no recent Mistake, and no change to the Streak.
  - The next hand counts again.
- **Saving:** the saved open Weighted hand keeps its looked-up flag, so a reload can't clear it. Saves without the flag load as not looked up.
- **The felt note:**
  - On a looked-up training hand, the felt's prompt subtitle reads "Looked up: this hand isn't counted".
  - Feedback titles add "· not counted".
- **Guide side effects:** opening the Guide (any chapter) ends a running Values sprint and pauses the Count drill. Closing the Guide resumes the Count drill as coming back to its tab does.

### Content and languages

- All tour and Guide text lives in one new content module, English and Mongolian side by side, separate from the UI strings.
- Content is structured blocks: heading, paragraph, list, card example, and the three live blocks (chart, Rules of thumb, Replay-the-tour button). The shell renders them and escapes all text; the content contains no markup.
- The Rules of thumb block reuses the existing Rule-of-thumb strings.
- Short labels, such as the button names, the "not counted" note and "Choose your chips", live with the UI strings.
- The deploy script's file list gains the new content module.

## Testing Decisions

- **Engine**, through `step`, `newLab` and `snapshot`:
  - After the look-up event mid-hand, answers still get feedback, marked not counted. Cell stats, Pending, recent Mistakes and the Streak are unchanged. The next hand is recorded as usual.
  - The Streak is paused, not reset: a Streak of 5 stays 5 through a looked-up hand and goes on counting afterwards.
  - Play: after the look-up event in the player turn, the Round's Actions raise no Coach flag and record no cell stats.
  - Nothing waiting: the event changes nothing.
  - The looked-up flag round-trips through the saved open hand, and a saved open hand without it loads as not looked up.
- **Strings suite:**
  - The English and Mongolian guides have the same shape: slide count, chapter ids and order, and block kinds in order.
  - No text block is empty.
  - Every new UI string exists in both languages.
- **Browser:**
  - First launch: the tour, then the chip picker. Skip leads to the chip picker too.
  - ? opens the Guide from each tab, and every chapter chip works. Rules, Chart and Why & how open their chapters.
  - The counting chapter opens by itself on the first counting visit, and not again after a reload.
  - A Drill hand after Chart shows the note and leaves the Streak unchanged.
  - The layout-stability measurement for all four Train modes at 390×844, 768×1024 and 1920×1080.

## Out of Scope

- A spotlight or coach-mark tour, and a guided first hand.
- Video, animation or images beyond CSS cards.
- Search inside the Guide.
- Index plays and other counting systems (as in the card-counting spec).
- Native review of the Mongolian text. It's still needed before publishing, and the Guide adds a lot of text to review.

## Further Notes

- The Guide is shell and content only. The engine's single change is the look-up event and the flag's persistence.
- The tour reuses the first-launch condition, so existing players never see it unless they replay it.
