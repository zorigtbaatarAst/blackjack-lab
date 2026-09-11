// The Tour and the Guide: all long-form help, English and Mongolian side by side.
// Plain text in structured blocks; the shell renders and escapes it. Card codes are rank + suit (s h d c), e.g. 'As', '10h'.
// Mongolian copy needs a native speaker's review before publishing (see the spec's Out of Scope).

export const GUIDE = {
  en: {
    tour: [
      { art: 'blackjack', title: 'Welcome to Blackjack Lab', text: 'Beat the dealer: finish closer to 21 than the dealer without going over.' },
      { art: 'chips', title: 'Play', text: 'Tap chips to bet and press Deal. Then Hit, Stand, Double or Split. Turn on Hint to see the best move.' },
      { art: 'check', title: 'Train', text: 'Drills deal real hands and grade every Decision against basic strategy. Values and Count teach card counting.' },
      { art: 'chart', title: 'Improve', text: 'See your accuracy, your strategy chart and your mistakes. Your best Drill streak goes on the leaderboard.' },
      { art: 'help', title: 'Help is always here', text: 'Tap ? any time for the rules, the strategy chart and card counting.' },
    ],
    chapters: [
      {
        id: 'play',
        title: 'How to play',
        blocks: [
          { h: 'The goal' },
          { p: "You play against the dealer, not against other players. Finish with a total closer to 21 than the dealer's, without going over 21." },
          { h: 'Card values' },
          { list: ['2 to 10 count as their number.', 'Jack, Queen and King count 10.', 'An ace counts 11, or 1 if 11 would take you over 21.'] },
          { cards: ['As', '6h'], caption: "Soft 17: the ace can still count 1, so one more card can't bust you." },
          { cards: ['10c', '7d'], caption: 'Hard 17: no ace counting 11, so a big card busts it.' },
          { h: 'Blackjack' },
          { cards: ['As', 'Kh'], caption: 'An ace and a ten-value card as your first two cards: Blackjack, paid 3 to 2.' },
          { h: 'The deal' },
          { p: 'You get two cards face up. The dealer gets two: one face up, the Upcard, and one face down, the hole card. Your moves depend on the Upcard.' },
          { h: 'Your moves' },
          {
            list: [
              'Hit: take another card, as many times as you like.',
              'Stand: keep your total and end your turn.',
              'Double: double your Bet, take exactly one more card, and stop.',
              'Split: two cards of the same rank become two Hands, each with its own Bet.',
            ],
          },
          { h: "The dealer's turn" },
          { p: 'When you are done, the dealer turns over the hole card and must draw until reaching 17 or more. The dealer makes no choices.' },
          { h: 'Results' },
          {
            list: [
              "Win: your total beats the dealer's, or the dealer busts. Paid 1 to 1.",
              'Blackjack: paid 3 to 2, unless the dealer has one too, which is a Push.',
              'Push: a tie. Your Bet comes back.',
              'Bust: over 21. You lose at once, even if the dealer busts later.',
            ],
          },
        ],
      },
      {
        id: 'table',
        title: "This table's rules",
        blocks: [
          { p: "Rules change the best strategy, so here are this table's exactly. The Book and every drill assume them." },
          {
            list: [
              'Six decks, reshuffled once three quarters of the Shoe has been dealt.',
              'The dealer stands on all 17s, soft 17 included.',
              'Blackjack pays 3 to 2.',
              'With an ace or a ten-value Upcard, the dealer first checks for Blackjack. If it is there, the Round ends at once and you lose only your first Bet.',
              'You may double on any first two cards, and after a split.',
              'You may split up to four Hands. Split aces get one card each.',
              'A Hand that reaches 21 stands by itself.',
              'No surrender and no insurance.',
              'Bets run from 10 to 500 chips. Chips are free and have no real value.',
            ],
          },
        ],
      },
      {
        id: 'strategy',
        title: 'Basic strategy',
        blocks: [
          { p: 'For every Hand you can hold against every dealer Upcard, one move loses the least over time. That move is the Book. Playing the Book cuts the house edge at this table to about half a percent.' },
          { h: 'How to read the chart' },
          {
            list: [
              'Find your Hand in the rows: hard totals, soft totals (with an ace counting 11), or pairs.',
              "Find the dealer's Upcard in the columns.",
              "The cell's colour and letter give the move: H hit, S stand, D double (or hit if you can't), Ds double (or stand if you can't), P split.",
            ],
          },
          { chart: true },
          { h: 'Rules of thumb' },
          { p: 'The chart is easier to remember as a few rules:' },
          { rules: true },
        ],
      },
      {
        id: 'counting',
        title: 'Card counting',
        blocks: [
          { h: 'Why counting works' },
          { p: "Cards that leave the Shoe don't come back until the shuffle, so the cards still to come keep changing. When many low cards have gone, what is left is rich in tens and aces, and that helps you:" },
          {
            list: [
              'More Blackjacks, which pay you 3 to 2. The dealer gets them too, but only wins 1 to 1.',
              'The dealer busts more: with 12 to 16 the dealer must draw, and a ten busts it.',
              'Your doubles on 10 and 11 end on strong totals more often.',
            ],
          },
          { p: "When the cards left are rich in low cards, the opposite happens and the house edge grows. Counting tells you which kind of Shoe you're in, so you bet more only when it favours you." },
          { h: 'How: the Hi-Lo count' },
          { cards: ['2h', '3s', '4d', '5c', '6h'], caption: '+1 each: low cards leaving helps you.' },
          { cards: ['7s', '8d', '9c'], caption: '0: neutral.' },
          { cards: ['10h', 'Js', 'Qd', 'Kc', 'Ah'], caption: '−1 each: tens and aces leaving hurts you.' },
          {
            list: [
              'Running count: start at 0 after the shuffle and add the value of every card you see. A full deck adds up to 0.',
              'True count: divide the Running count by the decks left, which you read from the Discard tray, and drop the fraction. +6 with 3 decks left is +2.',
              'Bet: the True count minus 1, in units of the table minimum, from 1 to 8. At +1 or lower, bet the minimum.',
            ],
          },
          { h: 'Practise' },
          { p: 'Values builds speed: give each card its value in a 30-second sprint. Count is the real skill: keep the count through dealt rounds and answer the checks.' },
          { p: 'Chips here have no value, so this is practice. In a real casino, counting in your head is legal, but the casino can ask you to stop playing.' },
        ],
      },
      {
        id: 'app',
        title: 'Using the app',
        blocks: [
          { h: 'Play' },
          { p: 'Tap chips to set your Bet, then Deal. Hint shows the Book move before you act, and Auto re-deals the same Bet after every Round. If you run out, your chips are refilled to your Starting chips.' },
          { h: 'Train' },
          {
            list: [
              'Drill: hands start from the situations players get wrong most. Every Decision is graded, and right answers build your Streak.',
              "My mistakes: hands start from the cells you've missed, until you get each one right twice in a row.",
              'Values and Count: card counting practice.',
              "Looking at the strategy chart while a Decision is waiting means that hand isn't counted. Your Streak waits for the next one.",
            ],
          },
          { h: 'Improve' },
          { p: 'Your accuracy, your own strategy chart with your mistakes marked, recent mistakes, table results, counting progress, and the leaderboard, which ranks your best Drill streak.' },
          { h: 'Keys on a computer' },
          {
            list: [
              'Play: 1–4 chips, Enter deal, H S D P to Hit, Stand, Double or Split, A auto bet.',
              'Train: H S D P answer, Enter next. Values: ← ↓ →. Count: type the number with digits and −, Enter answers.',
              '? opens this Guide, Esc closes it.',
            ],
          },
          { tourButton: true },
        ],
      },
    ],
  },

  mn: {
    tour: [
      { art: 'blackjack', title: 'Blackjack Lab-д тавтай морил', text: 'Дилерийг ял: 21-ээс хэтрэлгүйгээр дилерээс илүү 21-д ойр оноо цуглуул.' },
      { art: 'chips', title: 'Тоглох', text: 'Жетон дарж бооцоо тавиад Тараах-ыг дар. Дараа нь Авах, Зогсох, Давхарлах эсвэл Хуваах-ыг сонго. Зөвлөгөөг асаавал хамгийн зөв нүүдэл харагдана.' },
      { art: 'check', title: 'Дасгал', text: 'Дасгал бодит гар тарааж, шийдвэр бүрийг үндсэн стратегитай харьцуулж дүгнэнэ. Утга, Тоолох хэсэг карт тоолохыг заана.' },
      { art: 'chart', title: 'Ахиц', text: 'Нарийвчлал, стратегийн хүснэгт, алдаагаа хар. Дасгалын шилдэг цуврал тань тэргүүлэгчдийн жагсаалтад орно.' },
      { art: 'help', title: 'Тусламж үргэлж энд', text: 'Дүрэм, стратегийн хүснэгт, карт тоолох заавар хэрэгтэй бол хүссэн үедээ ?-г дар.' },
    ],
    chapters: [
      {
        id: 'play',
        title: 'Хэрхэн тоглох',
        blocks: [
          { h: 'Зорилго' },
          { p: 'Та бусад тоглогчтой биш, дилертэй тоглоно. 21-ээс хэтрэлгүйгээр дилерээс илүү 21-д ойр нийлбэр цуглуулах нь зорилго.' },
          { h: 'Картын оноо' },
          { list: ['2-оос 10 хүртэлх карт өөрийн тоогоор тоологдоно.', 'Боол, Хатан, Хаан 10 оноотой.', 'Тамга 11 оноотой, харин 11 гэж тооцвол 21-ээс хэтрэх бол 1 оноотой.'] },
          { cards: ['As', '6h'], caption: 'Зөөлөн 17: тамга 1 болж чадах тул дахиад нэг карт авахад хэтрэхгүй.' },
          { cards: ['10c', '7d'], caption: 'Хатуу 17: 11 гэж тоологдох тамга байхгүй тул том карт ирвэл хэтэрнэ.' },
          { h: 'Блэкжек' },
          { cards: ['As', 'Kh'], caption: 'Эхний хоёр карт тань тамга ба 10 оноотой карт бол Блэкжек: 3:2 төлнө.' },
          { h: 'Тараалт' },
          { p: 'Танд хоёр карт ил тараана. Дилер хоёр карт авна: нэг нь ил карт, нөгөө нь далд карт. Таны нүүдэл дилерийн ил картаас хамаарна.' },
          { h: 'Таны нүүдэл' },
          {
            list: [
              'Авах: дахиад карт авна, хэдэн ч удаа болно.',
              'Зогсох: нийлбэрээ хадгалж ээлжээ дуусгана.',
              'Давхарлах: бооцоогоо хоёр дахин нэмээд яг нэг карт аваад зогсоно.',
              'Хуваах: ижил хоёр карт хоёр тусдаа гар болж, тус бүр өөрийн бооцоотой.',
            ],
          },
          { h: 'Дилерийн ээлж' },
          { p: 'Таныг дуусмагц дилер далд картаа эргүүлж, 17 ба түүнээс дээш болтол заавал карт авна. Дилер сонголт хийдэггүй.' },
          { h: 'Үр дүн' },
          {
            list: [
              'Хожил: таны нийлбэр дилерийнхээс их, эсвэл дилер хэтэрвэл. 1:1 төлнө.',
              'Блэкжек: 3:2 төлнө, харин дилер бас блэкжектэй бол тэнцээ.',
              'Тэнцээ: оноо тэнцвэл бооцоо тань буцна.',
              'Хэтрэлт: 21-ээс давбал шууд хожигдоно, дилер дараа нь хэтэрсэн ч гэсэн.',
            ],
          },
        ],
      },
      {
        id: 'table',
        title: 'Энэ ширээний дүрэм',
        blocks: [
          { p: 'Дүрэм өөрчлөгдвөл хамгийн зөв стратеги ч өөрчлөгдөнө. Энэ ширээний яг дүрмийг доор жагсаав. Стратеги болон бүх дасгал эдгээрт үндэслэнэ.' },
          {
            list: [
              'Зургаан багц карт; хайрцгийн дөрөвний гурав тараагдмагц дахин холино.',
              'Дилер бүх 17 дээр зогсоно, зөөлөн 17 ч мөн адил.',
              'Блэкжек 3:2 төлнө.',
              'Дилерийн ил карт тамга эсвэл 10 оноотой бол дилер эхлээд блэкжек эсэхээ шалгана. Блэкжек байвал тойрог шууд дуусч, та зөвхөн анхны бооцоогоо алдана.',
              'Эхний хоёр карт дээр давхарлаж болно, хуваасны дараа ч болно.',
              'Дөрвөн гар хүртэл хувааж болно. Хуваасан тамга тус бүр нэг л карт авна.',
              '21 болсон гар өөрөө зогсоно.',
              'Бууж өгөх, даатгал байхгүй.',
              'Бооцоо 10-аас 500 жетон. Жетон үнэгүй бөгөөд бодит үнэ цэнэгүй.',
            ],
          },
        ],
      },
      {
        id: 'strategy',
        title: 'Үндсэн стратеги',
        blocks: [
          { p: 'Дилерийн ил карт бүрийн эсрэг таны гар бүрт урт хугацаанд хамгийн бага алддаг нэг нүүдэл бий. Тэр нүүдлийг Стратеги гэнэ. Стратегийн дагуу тоглоход энэ ширээн дээрх казиногийн давуу тал хагас хувь орчим болж буурна.' },
          { h: 'Хүснэгтийг хэрхэн унших вэ' },
          {
            list: [
              'Мөрүүдээс гараа ол: хатуу нийлбэр, зөөлөн нийлбэр (11 гэж тоологдох тамгатай) эсвэл хос.',
              'Баганаас дилерийн ил картыг ол.',
              'Нүдний өнгө, үсэг нүүдлийг заана: H авах, S зогсох, D давхарлах (боломжгүй бол авах), Ds давхарлах (боломжгүй бол зогсох), P хуваах.',
            ],
          },
          { chart: true },
          { h: 'Санах дүрмүүд' },
          { p: 'Хүснэгтийг цөөн дүрмээр санахад амар:' },
          { rules: true },
        ],
      },
      {
        id: 'counting',
        title: 'Карт тоолох',
        blocks: [
          { h: 'Тоолох яагаад ажилладаг вэ' },
          { p: 'Тараагдсан карт холих хүртэл буцаж ирэхгүй тул үлдсэн картын бүрэлдэхүүн байнга өөрчлөгдөнө. Бага картууд олноор гарсан үед үлдсэн хэсэгт 10 оноотой карт, тамга их байх бөгөөд энэ нь танд ашигтай:' },
          {
            list: [
              'Блэкжек олон бууна, танд 3:2 төлнө. Дилерт ч бас бууна, гэхдээ дилер ердөө 1:1 хожино.',
              'Дилер ойр ойрхон хэтэрнэ: 12–16 дээр дилер заавал карт авах бөгөөд 10 ирвэл хэтэрнэ.',
              '10 ба 11 дээр давхарлахад хүчтэй нийлбэр илүү олон гарна.',
            ],
          },
          { p: 'Үлдсэн хэсэгт бага карт их байвал эсрэгээрээ болж казиногийн давуу тал өснө. Тоолох нь ямар хайрцагтай байгааг хэлж өгөх тул зөвхөн танд ашигтай үед илүү бооцоо тавина.' },
          { h: 'Яаж: Hi-Lo тоолол' },
          { cards: ['2h', '3s', '4d', '5c', '6h'], caption: '+1 тус бүр: бага карт гарах нь танд ашигтай.' },
          { cards: ['7s', '8d', '9c'], caption: '0: саармаг.' },
          { cards: ['10h', 'Js', 'Qd', 'Kc', 'Ah'], caption: '−1 тус бүр: 10 оноотой карт, тамга гарах нь танд хохиролтой.' },
          {
            list: [
              'Явцын тоо: холисны дараа 0-ээс эхэлж, харсан карт бүрийн утгыг нэм. Бүтэн багцын нийлбэр 0.',
              'Жинхэнэ тоо: явцын тоог үлдсэн багцын тоонд хуваа (хаягдлын тавиураас уншина), бутархайг хая. 3 багц үлдсэн үед +6 бол +2.',
              'Бооцоо: жинхэнэ тоо хасах 1, ширээний доод бооцооны нэгжээр, 1-ээс 8. +1 ба түүнээс доош бол доод бооцоо тавь.',
            ],
          },
          { h: 'Дадлага' },
          { p: 'Утга хурд суулгана: 30 секундын спринтэд карт бүрийн утгыг хэл. Тоолох бол жинхэнэ ур чадвар: тараагдаж буй тойргуудын явцад тоогоо барьж, шалгалтад хариул.' },
          { p: 'Энд жетон үнэ цэнэгүй тул энэ бол дадлага. Жинхэнэ казинод толгойдоо тоолох нь хууль зөрчихгүй ч казино таныг тоглохоо болихыг хүсэж болно.' },
        ],
      },
      {
        id: 'app',
        title: 'Апп ашиглах',
        blocks: [
          { h: 'Тоглох' },
          { p: 'Жетон дарж бооцоогоо тогтоогоод Тараах-ыг дар. Зөвлөгөө нь нүүдэл хийхээс өмнө стратегийн нүүдлийг харуулна, Авто нь тойрог бүрийн дараа ижил бооцоогоор дахин тараана. Жетон дуусвал эхний жетоны хэмжээнд хүртэл нөхөгдөнө.' },
          { h: 'Дасгал' },
          {
            list: [
              'Дасгал: хамгийн их алддаг нөхцөлөөс гар эхэлнэ. Шийдвэр бүрийг дүгнэх ба зөв хариулт цувралыг тань өсгөнө.',
              'Миний алдаа: алдсан нүднүүдээс чинь гар эхэлнэ, нүд бүрийг хоёр удаа дараалан зөв хариултал.',
              'Утга ба Тоолох: карт тоолох дадлага.',
              'Шийдвэр хүлээгдэж байхад стратегийн хүснэгт харвал тэр гар тоологдохгүй. Цуврал тань дараагийн гарыг хүлээнэ.',
            ],
          },
          { h: 'Ахиц' },
          { p: 'Нарийвчлал, алдаа тэмдэглэгдсэн өөрийн стратегийн хүснэгт, сүүлийн алдаанууд, ширээний үр дүн, тоолох ахиц, мөн дасгалын шилдэг цувралаар эрэмбэлдэг тэргүүлэгчдийн жагсаалт.' },
          { h: 'Компьютерын товчлуур' },
          {
            list: [
              'Тоглох: 1–4 жетон, Enter тараах, H S D P авах, зогсох, давхарлах, хуваах, A авто бооцоо.',
              'Дасгал: H S D P хариулах, Enter дараах. Утга: ← ↓ →. Тоолох: тоо ба − бичээд Enter-ээр хариулна.',
              '? энэ гарын авлагыг нээнэ, Esc хаана.',
            ],
          },
          { tourButton: true },
        ],
      },
    ],
  },
}
