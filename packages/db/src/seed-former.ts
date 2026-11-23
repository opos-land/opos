// The demo data the seed wrote in English before it turned Polish
// (docs/adr/0080-write-the-seeds-demo-data-in-polish.md): each English text with the Polish one
// that replaced it, by the column the seed finds a row by or writes once. A run renames what an
// English run left before it seeds, so a database seeded before holds one demo and not two. What
// the seed writes again on every run needs no entry. The list goes once Dev and every checkout ran
// the seed in Polish.

export const FORMER_PROGRAM_ITEM_TITLES: Record<string, string> = {
  'Opening ceremony': 'Ceremonia otwarcia',
  'Worldbuilding from scratch': 'Budowanie świata od zera',
  'A history of tabletop role-playing': 'Historia gier fabularnych',
  'Costume armour workshop': 'Warsztaty zbroi kostiumowej',
  'Writing villains people remember': 'Złoczyńcy, których się pamięta',
  'Board game design clinic': 'Poradnia projektowania gier planszowych',
  'Folklore in modern fantasy': 'Folklor we współczesnej fantastyce',
  'Closing ceremony': 'Ceremonia zamknięcia',
  'Maps for imaginary worlds': 'Mapy wymyślonych światów',
  'Running your first campaign': 'Prowadzenie pierwszej kampanii',
  'Prop making on a budget': 'Rekwizyty małym kosztem',
  'Magic systems that hold together': 'Spójne systemy magii',
  'Miniature painting basics': 'Podstawy malowania figurek',
  'Dragons across cultures': 'Smoki w różnych kulturach',
  'Live action role-play safety': 'Bezpieczeństwo na larpach',
  'Translating fantasy fiction': 'Przekład literatury fantastycznej',
  'Speed painting contest': 'Konkurs szybkiego malowania',
  'An evening of fantasy music': 'Wieczór muzyki fantasy',
  'Welcome talk': 'Powitanie',
  'An introduction to live role-play': 'Wprowadzenie do larpów',
  'Fantasy cartography': 'Kartografia fantasy',
  'Closing panel': 'Panel zamykający',
  'Heraldry for invented kingdoms': 'Heraldyka wymyślonych królestw',
}

export const FORMER_TICKET_TYPE_NAMES: Record<string, string> = {
  Standard: 'Standardowy',
  Supporter: 'Wspierający',
}

export const FORMER_ADD_ON_NAMES: Record<string, string> = {
  'Miniature painting workshop': 'Warsztaty malowania figurek',
  'Sleeping room': 'Sala noclegowa',
}

export const FORMER_MERCHANDISE_ITEM_NAMES: Record<string, string> = {
  'T-shirt': 'Koszulka',
  'Enamel pin': 'Przypinka',
}

export const FORMER_AXIS_NAMES: Record<string, string> = {
  Cut: 'Krój',
  Size: 'Rozmiar',
}

export const FORMER_VALUE_LABELS: Record<string, string> = {
  "Women's": 'Damski',
  "Men's": 'Męski',
}

export const FORMER_CUSTOM_FIELD_LABELS: Record<string, string> = {
  'City you travel from': 'Miasto, z którego przyjeżdżasz',
  'Favourite fandom': 'Ulubiony fandom',
}

export const FORMER_CONSENT_TEXTS: Record<string, string> = {
  'I accept the shop terms.': 'Akceptuję regulamin sklepu.',
  'I have read the privacy policy.': 'Znam politykę prywatności.',
  'I want to receive news of the convention by email.':
    'Chcę dostawać e-mailem wiadomości o konwencie.',
}

export const FORMER_SCANNER_NAMES: Record<string, string> = {
  'Main gate': 'Główne wejście',
  'Merchandise desk': 'Stoisko z gadżetami',
}

export const FORMER_HOLDER_NAMES: Record<string, string> = {
  'Demo Waiting': 'Demo Czekający',
  'Demo Teen': 'Demo Nastolatek',
  'Demo Merch': 'Demo Gadżety',
  'Demo Guest of Honour': 'Demo Gość Honorowy',
  'Demo First Fan': 'Demo Pierwszy Fan',
  'Demo Guest': 'Demo Gość',
  'Demo Company': 'Demo Firma',
  'Demo Volunteer': 'Demo Wolontariusz',
  'Demo Changed': 'Demo Zmieniony',
  'Demo Late': 'Demo Spóźniony',
  'Demo Review': 'Demo Do Wyjaśnienia',
  'Demo Declined': 'Demo Odrzucony',
  'Demo Canceled': 'Demo Anulowany',
}

export const FORMER_ORDER_NOTES: Record<string, string> = {
  'Paid in cash at the desk.': 'Zapłacono gotówką w kasie.',
  'Invoice 7/2026.': 'Faktura 7/2026.',
}

/** The files of the pictures of an item, which the seed finds by their name. */
export const FORMER_PICTURE_FILE_NAMES: Record<string, string> = {
  'T-shirt - front.png': 'Koszulka – przód.png',
  'T-shirt - back.png': 'Koszulka – tył.png',
  'T-shirt - print.png': 'Koszulka – nadruk.png',
  'Enamel pin.png': 'Przypinka.png',
}

export const FORMER_REPORT_NOTES: Record<string, string> = {
  'A demo report that gave an address.': 'Zgłoszenie demonstracyjne, które podało adres.',
}

/** How the subject of a demo email began in English; the seed writes such an email's text anew. */
export const FORMER_EMAIL_SUBJECTS = ['Your %', 'A payment arrived %']
