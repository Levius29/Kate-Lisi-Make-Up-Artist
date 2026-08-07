/**
 * CONTRACT TEMPLATE — LEGAL INSTRUMENT. READ THIS HEADER BEFORE CHANGING ANYTHING.
 * ---------------------------------------------------------------------------------
 * This file contains the entire text of the client contract, in English and Italian,
 * and nothing else. There is no application logic here on purpose: a lawyer must be
 * able to read and amend the wording without touching code.
 *
 * The clauses are drafted to be enforceable under ITALIAN law. They are pending
 * review by an Italian lawyer and must be reviewed once before first use with a
 * client (SPEC.md §8).
 *
 * DO NOT reword, "improve", condense, or translate these clauses. In particular, do
 * not substitute Anglo-American contract boilerplate: "liquidated damages",
 * "consideration", "time is of the essence" and similar terms carry no meaning before
 * an Italian court and weaken the clauses that do. "Caparra confirmatoria" is NOT a
 * "non-refundable deposit" — the substitution voids the clause. A model asked to
 * polish this file will produce something that reads better in English and no longer
 * holds in Rome. Changes need explicit human approval.
 *
 * ---------------------------------------------------------------------------------
 * NOTES FOR THE REVIEWING LAWYER (not printed in the PDF)
 *
 * 1. Clause 4 is drafted as a caparra confirmatoria under art. 1385 c.c. and states
 *    both directions of the remedy (retention by the Artist; double the amount owed
 *    by the Artist). Clause 5 adds a separate clausola penale under art. 1382 c.c.
 *    graduated by date. Please confirm the interaction between the two is expressed
 *    as intended — in particular the set-off of sums already paid as caparra against
 *    the penalty due, in the last paragraph of clause 5.
 *
 * 2. Clause 10 confers exclusive jurisdiction on the Courts of Rome, and clause 11
 *    lists it among the clauses approved by a second, separate signature under
 *    artt. 1341–1342 c.c. Please note that where the client is a consumer, a clause
 *    derogating from the consumer's forum (art. 33(2)(u) Codice del Consumo) is
 *    presumed vexatious and the double signature does not by itself save it. Most of
 *    the clients here are consumers resident abroad, and Regulation (EU) 1215/2012
 *    artt. 17–19 may also bear on the point. This was flagged during the build and
 *    deliberately left as specified rather than resolved in software.
 *
 * 3. Clause 8 states a ten-year retention period by reference to art. 2220 c.c. for
 *    accounting records, and a shorter period for health data (allergies). Please
 *    confirm both periods.
 * ---------------------------------------------------------------------------------
 *
 * Placeholders are written as {token} and are substituted by src/contract/pdf.ts from
 * the immutable snapshots stored on the Contract record. Every date token is already
 * formatted in full ("14 September 2026") and every money token already carries its
 * currency ("EUR 450.00") before it reaches this template.
 */

export const TEMPLATE_VERSION = '1.0.0';

export type ContractLocale = 'en' | 'it';

/** One clause: a heading and its paragraphs. Paragraphs may contain {tokens}. */
export interface Clause {
  /** Clause number as printed, e.g. "4". */
  number: string;
  heading: string;
  paragraphs: string[];
}

export interface ContractText {
  documentTitle: string;
  contractNumberLabel: string;
  /** Printed under the title, above clause 1. */
  preamble: string[];
  clauses: {
    parties: Clause;
    object: Clause;
    fees: Clause;
    deposit: Clause;
    cancellation: Clause;
    forceMajeure: Clause;
    allergies: Clause;
    dataProtection: Clause;
    imageRelease: Clause;
    governingLaw: Clause;
  };
  /** Row patterns for the cancellation ladder table in clause 5. */
  ladder: {
    columnDate: string;
    columnConsequence: string;
    rowFirst: string;
    rowMiddle: string;
    rowLast: string;
    consequenceDepositOnly: string;
    consequencePercent: string;
  };
  /** Fee table column headings for clause 3. */
  feeTable: {
    description: string;
    quantity: string;
    unitPrice: string;
    amount: string;
    total: string;
    deposit: string;
    balance: string;
  };
  /** The four image-release options, printed as checkboxes in clause 9. */
  imageOptions: {
    none: string;
    private_portfolio: string;
    social_media: string;
    face_obscured: string;
  };
  signatures: {
    readAndApproved: string;
    placeAndDate: string;
    theClient: string;
    theArtist: string;
    specificApprovalHeading: string;
    specificApprovalIntro: string;
    /** Clause list printed immediately above the second signature line. */
    onerousClauses: string[];
    theClientSecondSignature: string;
  };
  footer: {
    /** Printed in the footer of every page. */
    line: string;
  };
}

/* =================================================================================
 * ENGLISH — default language. Clients are American, British and Gulf-region.
 * Italian legal concepts are rendered in English; the Italian terms of art are kept
 * in the English text with an inline explanation, because the English near-equivalent
 * would change the legal effect.
 * ================================================================================= */

const en: ContractText = {
  documentTitle: 'AGREEMENT FOR PROFESSIONAL MAKE-UP SERVICES',
  contractNumberLabel: 'Contract no.',

  preamble: [
    'This agreement is entered into on {generatedDateLong} between the parties identified in clause 1 below, and governs the professional make-up services described in clause 2.',
  ],

  clauses: {
    parties: {
      number: '1',
      heading: 'THE PARTIES',
      paragraphs: [
        '{businessName}, with registered office at {registeredAddress}, Italian VAT number (Partita IVA) {vatNumber}, tax code (Codice Fiscale) {taxCode}, acting as a self-employed professional — hereinafter "the Artist";',
        'and',
        '{clientFullName}, resident at {clientAddress} — hereinafter "the Client".',
        'The Artist carries on an itinerant activity and holds no premises open to the public. The address stated above is the Artist\'s registered fiscal address and serves to identify the party; it is not the place where the services are performed. The place of performance is the one stated in clause 2.',
      ],
    },

    object: {
      number: '2',
      heading: 'SUBJECT OF THE AGREEMENT',
      paragraphs: [
        'The Artist undertakes to perform the following professional make-up services:',
        '{serviceName} — {serviceDescription}',
        'Date of performance: {dateLong}',
        'Start time: {startTime}',
        'Expected duration: {durationText}',
        'Number of persons to be made up: {peopleCount}',
        'Place of performance: {venueName}, {venueAddress}',
        'The place of performance stated above is the venue designated by the Client. The Artist attends that venue; no service is performed at the address stated in clause 1.',
      ],
    },

    fees: {
      number: '3',
      heading: 'FEES AND PAYMENT',
      paragraphs: [
        'The fee for the services described in clause 2 is itemised below.',
        '{feeTable}',
        'The deposit of {depositAmount} is payable on signature of this agreement and is governed by clause 4. The balance of {balanceAmount} is payable by {balanceDueDateLong}.',
        'Payment is made by bank transfer, Wise or Revolut, to: {accountHolder}, IBAN {iban}, BIC/SWIFT {bicSwift}. Bank charges, where applied by the Client\'s own bank or payment provider, are borne by the Client.',
        'The amounts stated are final and are not subject to VAT, the Artist operating under the flat-rate scheme (regime forfettario) provided for by Article 1, paragraphs 54 to 89, of Law No. 190 of 23 December 2014.',
      ],
    },

    deposit: {
      number: '4',
      heading: 'DEPOSIT — CAPARRA CONFIRMATORIA (Article 1385 of the Italian Civil Code)',
      paragraphs: [
        'The sum of {depositAmount}, paid by the Client on signature of this agreement, is given and accepted as a caparra confirmatoria within the meaning of Article 1385 of the Italian Civil Code.',
        'The Italian term is used deliberately and is not a stylistic choice. A caparra confirmatoria is not an advance payment and is not a refundable deposit: it is a sum given on conclusion of the agreement which, on default, entitles the party who is not in default to withdraw and to keep — or to claim double — that sum, without proof of damage. The parties expressly exclude any construction of this sum as a mere advance (acconto).',
        'The consequences are those laid down by Article 1385 of the Italian Civil Code, and they run in both directions:',
        '(a) if the Client withdraws from this agreement or otherwise fails to perform, the Artist may withdraw from the agreement and retain the caparra confirmatoria in full, that is {depositAmount};',
        '(b) if the Artist withdraws from this agreement or otherwise fails to perform, the Client may withdraw from the agreement and demand payment of double the caparra confirmatoria, that is {depositDoubleAmount}.',
        'In either case, the party who is not in default may instead choose to demand performance of the agreement or its termination, with compensation for damage governed by the general rules, in accordance with the third paragraph of Article 1385 of the Italian Civil Code.',
      ],
    },

    cancellation: {
      number: '5',
      heading: 'WITHDRAWAL BY THE CLIENT AND PENALTY CLAUSE (Article 1382 of the Italian Civil Code)',
      paragraphs: [
        'In addition to the caparra confirmatoria governed by clause 4, the parties agree the following penalty clause (clausola penale) under Article 1382 of the Italian Civil Code, graduated by reference to the date on which the Artist receives written notice of the Client\'s withdrawal:',
        '{ladderTable}',
        'The penalty is due irrespective of proof of damage, and it limits compensation to the sum agreed, compensation for further damage not having been reserved. Sums already paid by the Client as caparra confirmatoria are set off against the penalty due.',
        'Notice of withdrawal takes effect when it reaches the Artist in writing, at the contact address stated in clause 8.',
      ],
    },

    forceMajeure: {
      number: '6',
      heading: 'SUPERVENING IMPOSSIBILITY, FORCE MAJEURE AND POSTPONEMENT',
      paragraphs: [
        'Neither party is liable for failure to perform where performance has become impossible for a cause not attributable to that party, within the meaning of Articles 1218 and 1256 of the Italian Civil Code — including, by way of example, serious illness or accident, an order of a public authority, or the interruption of transport services.',
        'Where the engagement is postponed by agreement between the parties, the caparra confirmatoria already paid is carried over once to the new date, provided that the new date falls within twelve months of the date stated in clause 2 and that the Artist is available on it. A second postponement does not carry the caparra confirmatoria over, and clause 4 then applies.',
        'Where performance becomes definitively impossible for a cause attributable to neither party, the agreement is terminated and the caparra confirmatoria is returned to the Client, no penalty being due under clause 5.',
      ],
    },

    allergies: {
      number: '7',
      heading: 'ALLERGIES, SKIN CONDITIONS AND PATCH TEST',
      paragraphs: [
        'The Client declares having disclosed to the Artist every known allergy, intolerance and skin condition, and in particular the following: {allergies}',
        '{patchTestStatement}',
        'Product requirements agreed between the parties: {productRequirements}',
        'The Client undertakes to inform the Artist without delay of any change occurring before the date of performance. The Artist is not liable for reactions arising from conditions that were not disclosed, or from products supplied by the Client or by third parties.',
      ],
    },

    dataProtection: {
      number: '8',
      heading: 'PROCESSING OF PERSONAL DATA (Regulation (EU) 2016/679)',
      paragraphs: [
        'Controller: {businessName}, {registeredAddress}. Contact address for all matters concerning personal data: {businessEmail}.',
        'Purposes: performance of this agreement and of the services described in clause 2; management of payments; compliance with the accounting and tax obligations to which the Artist is subject.',
        'Legal basis: Article 6(1)(b) of the Regulation for the performance of the agreement, and Article 6(1)(c) for the legal obligations to which the Artist is subject. Data concerning health — allergies and skin conditions disclosed under clause 7 — is processed only on the basis of the Client\'s explicit consent under Article 9(2)(a) of the Regulation, and solely to perform the service safely.',
        'Retention: personal data is retained for the duration of the engagement and thereafter for ten years, the period laid down for accounting records by Article 2220 of the Italian Civil Code. Data concerning health is erased within twelve months of the date of performance.',
        'Recipients: the data is held on the Artist\'s own device and is not transferred to third parties, save to the Artist\'s accountant for tax purposes and where disclosure is required by law. There is no transfer of data outside the European Economic Area.',
        'Rights of the Client: the Client may at any time exercise the rights conferred by Articles 15 to 22 of Regulation (EU) 2016/679 — access to the data, rectification, erasure, restriction of processing, data portability, and objection to processing — by writing to the contact address stated above. Where processing is based on consent, consent may be withdrawn at any time, without affecting the lawfulness of processing carried out before withdrawal. The Client may also lodge a complaint with the Garante per la protezione dei dati personali, the Italian supervisory authority.',
      ],
    },

    imageRelease: {
      number: '9',
      heading: 'IMAGE RELEASE (Articles 96 and 97 of Law No. 633 of 22 April 1941; Article 10 of the Italian Civil Code)',
      paragraphs: [
        'The Client\'s image may be reproduced by the Artist only within the limits of the single option marked below. The Artist may not exceed that option. This consent is freely given, is not a condition of the service, and may be withdrawn at any time in writing, with effect for the future.',
        '{imageOptions}',
        'No use is permitted that associates the Client\'s image with a third-party product or brand, and no image may be transferred to a third party, unless separately agreed in writing.',
      ],
    },

    governingLaw: {
      number: '10',
      heading: 'GOVERNING LAW AND JURISDICTION',
      paragraphs: [
        'This agreement is governed by Italian law.',
        'Any dispute arising out of or in connection with this agreement — including disputes as to its validity, interpretation, performance and termination — falls within the exclusive jurisdiction of the Courts of {courtOfJurisdiction}.',
        'This document, drawn up in the English language, is the text agreed between the parties. Where an Italian version is also issued, it is issued for convenience only.',
      ],
    },
  },

  ladder: {
    columnDate: 'Date on which written notice of withdrawal reaches the Artist',
    columnConsequence: 'Consequence',
    rowFirst: 'On or before {cutoffDateLong}',
    rowMiddle: 'After {previousCutoffDateLong} and on or before {cutoffDateLong}',
    rowLast: 'After {previousCutoffDateLong}',
    consequenceDepositOnly: 'The Artist retains the caparra confirmatoria only, that is {depositAmount}.',
    consequencePercent: 'The Client owes {retainPercent}% of the total fee, that is {retainedAmount}.',
  },

  feeTable: {
    description: 'Description',
    quantity: 'Qty',
    unitPrice: 'Unit price',
    amount: 'Amount',
    total: 'Total fee',
    deposit: 'Deposit (caparra confirmatoria)',
    balance: 'Balance due by {balanceDueDateLong}',
  },

  imageOptions: {
    none: 'No use. No photograph or recording of the Client may be used for any purpose.',
    private_portfolio: 'Private portfolio only. Images may be shown to prospective clients in person or in a portfolio that is not published online.',
    social_media: 'Social media and website. Images may be published on the Artist\'s professional channels and website.',
    face_obscured: 'Face obscured. Images may be published only where the Client\'s face is not recognisable.',
  },

  signatures: {
    readAndApproved: 'The Client declares having read this agreement in its entirety, in each of its clauses, and approves it.',
    placeAndDate: 'Place and date',
    theClient: 'The Client',
    theArtist: 'The Artist',
    specificApprovalHeading: 'SPECIFIC APPROVAL OF CLAUSES (Articles 1341 and 1342 of the Italian Civil Code)',
    specificApprovalIntro: 'Under the second paragraph of Article 1341 and under Article 1342 of the Italian Civil Code, the Client, having read them again and understood each of them individually, expressly approves the following clauses:',
    onerousClauses: [
      'clause 4 (deposit — caparra confirmatoria: retention by the Artist on the Client\'s withdrawal, and payment of double the amount on the Artist\'s withdrawal);',
      'clause 5 (withdrawal by the Client and penalty clause graduated by date, and set-off of the caparra against the penalty);',
      'clause 6 (supervening impossibility, force majeure, and the limit of a single postponement within twelve months);',
      'clause 7 (declaration on allergies and patch test, and exclusion of the Artist\'s liability for conditions not disclosed);',
      'clause 10 (governing law and exclusive jurisdiction of the Courts of {courtOfJurisdiction}).',
    ],
    theClientSecondSignature: 'The Client — second signature, for specific approval of the clauses listed above',
  },

  footer: {
    line: 'Contract {contractNumber} — {businessName} — page {page} of {pages}',
  },
};

/* =================================================================================
 * ITALIAN — for the occasional Italian client, where an English-only contract would
 * weaken every clause. This is the original register of the concepts used throughout.
 * ================================================================================= */

const it: ContractText = {
  documentTitle: 'CONTRATTO PER PRESTAZIONI PROFESSIONALI DI TRUCCO',
  contractNumberLabel: 'Contratto n.',

  preamble: [
    'Il presente contratto è concluso il {generatedDateLong} tra le parti indicate all\'articolo 1 e disciplina le prestazioni professionali di trucco descritte all\'articolo 2.',
  ],

  clauses: {
    parties: {
      number: '1',
      heading: 'LE PARTI',
      paragraphs: [
        '{businessName}, con domicilio fiscale in {registeredAddress}, partita IVA {vatNumber}, codice fiscale {taxCode}, in qualità di libera professionista — di seguito «la Truccatrice»;',
        'e',
        '{clientFullName}, residente in {clientAddress} — di seguito «il Cliente».',
        'La Truccatrice esercita attività itinerante e non dispone di locali aperti al pubblico. L\'indirizzo sopra indicato è il domicilio fiscale della Truccatrice e vale a identificare la parte; non è il luogo di esecuzione della prestazione. Il luogo di esecuzione è quello indicato all\'articolo 2.',
      ],
    },

    object: {
      number: '2',
      heading: 'OGGETTO DEL CONTRATTO',
      paragraphs: [
        'La Truccatrice si obbliga a eseguire le seguenti prestazioni professionali di trucco:',
        '{serviceName} — {serviceDescription}',
        'Data di esecuzione: {dateLong}',
        'Ora di inizio: {startTime}',
        'Durata prevista: {durationText}',
        'Numero di persone da truccare: {peopleCount}',
        'Luogo di esecuzione: {venueName}, {venueAddress}',
        'Il luogo di esecuzione sopra indicato è quello designato dal Cliente. La Truccatrice si reca presso tale luogo; nessuna prestazione è eseguita presso l\'indirizzo indicato all\'articolo 1.',
      ],
    },

    fees: {
      number: '3',
      heading: 'CORRISPETTIVO E PAGAMENTO',
      paragraphs: [
        'Il corrispettivo delle prestazioni descritte all\'articolo 2 è dettagliato di seguito.',
        '{feeTable}',
        'La caparra di {depositAmount} è dovuta alla sottoscrizione del presente contratto ed è regolata dall\'articolo 4. Il saldo di {balanceAmount} è dovuto entro il {balanceDueDateLong}.',
        'Il pagamento è effettuato mediante bonifico bancario, Wise o Revolut, a favore di: {accountHolder}, IBAN {iban}, BIC/SWIFT {bicSwift}. Le eventuali spese applicate dalla banca o dal prestatore di servizi di pagamento del Cliente sono a carico del Cliente.',
        'Gli importi indicati sono definitivi e non sono soggetti a IVA, operando la Truccatrice in regime forfettario ai sensi dell\'articolo 1, commi da 54 a 89, della legge 23 dicembre 2014, n. 190.',
      ],
    },

    deposit: {
      number: '4',
      heading: 'CAPARRA CONFIRMATORIA (articolo 1385 del codice civile)',
      paragraphs: [
        'La somma di {depositAmount}, versata dal Cliente alla sottoscrizione del presente contratto, è data e accettata a titolo di caparra confirmatoria ai sensi dell\'articolo 1385 del codice civile.',
        'Le parti escludono espressamente che tale somma possa essere qualificata come semplice acconto.',
        'Ne conseguono gli effetti previsti dall\'articolo 1385 del codice civile, operanti in entrambe le direzioni:',
        '(a) se il Cliente recede dal presente contratto o comunque risulta inadempiente, la Truccatrice può recedere dal contratto e ritenere integralmente la caparra confirmatoria, pari a {depositAmount};',
        '(b) se la Truccatrice recede dal presente contratto o comunque risulta inadempiente, il Cliente può recedere dal contratto ed esigere il doppio della caparra confirmatoria, pari a {depositDoubleAmount}.',
        'In entrambi i casi la parte non inadempiente conserva la facoltà di domandare, in alternativa, l\'esecuzione o la risoluzione del contratto, con risarcimento del danno regolato dalle norme generali, ai sensi del terzo comma dell\'articolo 1385 del codice civile.',
      ],
    },

    cancellation: {
      number: '5',
      heading: 'RECESSO DEL CLIENTE E CLAUSOLA PENALE (articolo 1382 del codice civile)',
      paragraphs: [
        'Oltre alla caparra confirmatoria regolata dall\'articolo 4, le parti convengono la seguente clausola penale ai sensi dell\'articolo 1382 del codice civile, graduata in funzione della data in cui la Truccatrice riceve comunicazione scritta del recesso del Cliente:',
        '{ladderTable}',
        'La penale è dovuta indipendentemente dalla prova del danno e limita il risarcimento alla prestazione promessa, non essendo stata convenuta la risarcibilità del danno ulteriore. Le somme già versate dal Cliente a titolo di caparra confirmatoria sono imputate alla penale dovuta.',
        'La comunicazione di recesso produce effetto quando perviene per iscritto alla Truccatrice, all\'indirizzo indicato all\'articolo 8.',
      ],
    },

    forceMajeure: {
      number: '6',
      heading: 'IMPOSSIBILITÀ SOPRAVVENUTA, FORZA MAGGIORE E RINVIO',
      paragraphs: [
        'Nessuna delle parti risponde dell\'inadempimento determinato da causa a essa non imputabile, ai sensi degli articoli 1218 e 1256 del codice civile — ivi comprese, a titolo esemplificativo, malattia grave o infortunio, provvedimento dell\'autorità, interruzione dei servizi di trasporto.',
        'Qualora l\'incarico sia rinviato di comune accordo tra le parti, la caparra confirmatoria già versata è trasferita una sola volta alla nuova data, purché questa cada entro dodici mesi dalla data indicata all\'articolo 2 e la Truccatrice risulti disponibile. Un secondo rinvio non comporta il trasferimento della caparra confirmatoria, alla quale torna ad applicarsi l\'articolo 4.',
        'Qualora la prestazione divenga definitivamente impossibile per causa non imputabile ad alcuna delle parti, il contratto si risolve e la caparra confirmatoria è restituita al Cliente, senza che sia dovuta alcuna penale ai sensi dell\'articolo 5.',
      ],
    },

    allergies: {
      number: '7',
      heading: 'ALLERGIE, CONDIZIONI DELLA PELLE E PATCH TEST',
      paragraphs: [
        'Il Cliente dichiara di avere comunicato alla Truccatrice ogni allergia, intolleranza e condizione della pelle a sua conoscenza, e in particolare le seguenti: {allergies}',
        '{patchTestStatement}',
        'Requisiti sui prodotti concordati tra le parti: {productRequirements}',
        'Il Cliente si obbliga a informare senza ritardo la Truccatrice di ogni variazione che intervenga prima della data di esecuzione. La Truccatrice non risponde delle reazioni derivanti da condizioni non dichiarate, né da prodotti forniti dal Cliente o da terzi.',
      ],
    },

    dataProtection: {
      number: '8',
      heading: 'TRATTAMENTO DEI DATI PERSONALI (Regolamento (UE) 2016/679)',
      paragraphs: [
        'Titolare del trattamento: {businessName}, {registeredAddress}. Indirizzo di contatto per ogni questione relativa ai dati personali: {businessEmail}.',
        'Finalità: esecuzione del presente contratto e delle prestazioni descritte all\'articolo 2; gestione dei pagamenti; adempimento degli obblighi contabili e fiscali cui la Truccatrice è soggetta.',
        'Base giuridica: articolo 6, paragrafo 1, lettera b), del Regolamento per l\'esecuzione del contratto, e articolo 6, paragrafo 1, lettera c), per gli obblighi di legge. I dati relativi alla salute — allergie e condizioni della pelle dichiarate ai sensi dell\'articolo 7 — sono trattati esclusivamente sulla base del consenso esplicito del Cliente ai sensi dell\'articolo 9, paragrafo 2, lettera a), del Regolamento, e al solo fine di eseguire la prestazione in sicurezza.',
        'Conservazione: i dati personali sono conservati per la durata dell\'incarico e successivamente per dieci anni, termine previsto per le scritture contabili dall\'articolo 2220 del codice civile. I dati relativi alla salute sono cancellati entro dodici mesi dalla data di esecuzione.',
        'Destinatari: i dati sono conservati sul dispositivo della Truccatrice e non sono comunicati a terzi, salvo che al commercialista della Truccatrice per finalità fiscali e nei casi in cui la comunicazione sia imposta dalla legge. Non è effettuato alcun trasferimento di dati fuori dallo Spazio economico europeo.',
        'Diritti del Cliente: il Cliente può esercitare in ogni momento i diritti riconosciuti dagli articoli da 15 a 22 del Regolamento (UE) 2016/679 — accesso ai dati, rettifica, cancellazione, limitazione del trattamento, portabilità dei dati e opposizione al trattamento — scrivendo all\'indirizzo di contatto sopra indicato. Quando il trattamento si fonda sul consenso, questo può essere revocato in ogni momento, senza pregiudizio della liceità del trattamento effettuato prima della revoca. Il Cliente può inoltre proporre reclamo al Garante per la protezione dei dati personali.',
      ],
    },

    imageRelease: {
      number: '9',
      heading: 'LIBERATORIA PER L\'USO DELL\'IMMAGINE (articoli 96 e 97 della legge 22 aprile 1941, n. 633; articolo 10 del codice civile)',
      paragraphs: [
        'L\'immagine del Cliente può essere riprodotta dalla Truccatrice nei soli limiti dell\'unica opzione contrassegnata di seguito. La Truccatrice non può eccedere tale opzione. Il consenso è prestato liberamente, non costituisce condizione per l\'esecuzione della prestazione e può essere revocato in ogni momento per iscritto, con effetto per il futuro.',
        '{imageOptions}',
        'Non è consentito alcun uso che associ l\'immagine del Cliente a prodotti o marchi di terzi, né la cessione delle immagini a terzi, salvo distinto accordo scritto.',
      ],
    },

    governingLaw: {
      number: '10',
      heading: 'LEGGE APPLICABILE E FORO COMPETENTE',
      paragraphs: [
        'Il presente contratto è regolato dalla legge italiana.',
        'Per ogni controversia derivante dal presente contratto o comunque a esso connessa — comprese quelle relative alla sua validità, interpretazione, esecuzione e risoluzione — è competente in via esclusiva il Foro di {courtOfJurisdiction}.',
        'Il presente documento, redatto in lingua italiana, costituisce il testo concordato tra le parti.',
      ],
    },
  },

  ladder: {
    columnDate: 'Data in cui la comunicazione scritta di recesso perviene alla Truccatrice',
    columnConsequence: 'Conseguenza',
    rowFirst: 'Entro il {cutoffDateLong}',
    rowMiddle: 'Dopo il {previousCutoffDateLong} ed entro il {cutoffDateLong}',
    rowLast: 'Dopo il {previousCutoffDateLong}',
    consequenceDepositOnly: 'La Truccatrice ritiene la sola caparra confirmatoria, pari a {depositAmount}.',
    consequencePercent: 'Il Cliente deve il {retainPercent}% del corrispettivo complessivo, pari a {retainedAmount}.',
  },

  feeTable: {
    description: 'Descrizione',
    quantity: 'Q.tà',
    unitPrice: 'Prezzo unitario',
    amount: 'Importo',
    total: 'Corrispettivo complessivo',
    deposit: 'Caparra confirmatoria',
    balance: 'Saldo dovuto entro il {balanceDueDateLong}',
  },

  imageOptions: {
    none: 'Nessun utilizzo. Nessuna fotografia o ripresa del Cliente può essere utilizzata per alcuna finalità.',
    private_portfolio: 'Solo portfolio privato. Le immagini possono essere mostrate a potenziali clienti di persona o in un portfolio non pubblicato online.',
    social_media: 'Social media e sito web. Le immagini possono essere pubblicate sui canali professionali e sul sito della Truccatrice.',
    face_obscured: 'Volto non riconoscibile. Le immagini possono essere pubblicate solo ove il volto del Cliente non sia riconoscibile.',
  },

  signatures: {
    readAndApproved: 'Il Cliente dichiara di avere letto il presente contratto in ogni sua parte e in ciascuna delle sue clausole, e lo approva.',
    placeAndDate: 'Luogo e data',
    theClient: 'Il Cliente',
    theArtist: 'La Truccatrice',
    specificApprovalHeading: 'APPROVAZIONE SPECIFICA DELLE CLAUSOLE (articoli 1341 e 1342 del codice civile)',
    specificApprovalIntro: 'Ai sensi dell\'articolo 1341, secondo comma, e dell\'articolo 1342 del codice civile, il Cliente, dopo averle rilette e singolarmente comprese, approva espressamente le seguenti clausole:',
    onerousClauses: [
      'articolo 4 (caparra confirmatoria: ritenzione da parte della Truccatrice in caso di recesso del Cliente e pagamento del doppio in caso di recesso della Truccatrice);',
      'articolo 5 (recesso del Cliente e clausola penale graduata per data, con imputazione della caparra alla penale);',
      'articolo 6 (impossibilità sopravvenuta, forza maggiore e limite di un solo rinvio entro dodici mesi);',
      'articolo 7 (dichiarazione su allergie e patch test ed esclusione di responsabilità della Truccatrice per condizioni non dichiarate);',
      'articolo 10 (legge applicabile e competenza esclusiva del Foro di {courtOfJurisdiction}).',
    ],
    theClientSecondSignature: 'Il Cliente — seconda sottoscrizione, per approvazione specifica delle clausole sopra elencate',
  },

  footer: {
    line: 'Contratto {contractNumber} — {businessName} — pagina {page} di {pages}',
  },
};

export const contractTemplate: Record<ContractLocale, ContractText> = { en, it };

/* ---------------------------------------------------------------------------------
 * Sentences that depend on a condition, kept here so that all client-facing wording
 * lives in this file. Selected by src/contract/pdf.ts.
 * ------------------------------------------------------------------------------- */

export const patchTestStatements: Record<ContractLocale, Record<'done' | 'required_not_done' | 'not_required', string>> = {
  en: {
    done: 'The service booked requires a patch test. The Client declares that a patch test was carried out on {patchTestDateLong} and that no adverse reaction followed.',
    required_not_done: 'The service booked requires a patch test, which has not yet been carried out. The parties agree that it must take place no later than forty-eight hours before the time stated in clause 2, failing which the Artist may decline to perform the service, and clause 5 applies as if the Client had withdrawn.',
    not_required: 'The service booked does not require a patch test. The Client may request one at any time before the date of performance.',
  },
  it: {
    done: 'La prestazione richiede il patch test. Il Cliente dichiara che il patch test è stato eseguito il {patchTestDateLong} e che non è seguita alcuna reazione avversa.',
    required_not_done: 'La prestazione richiede il patch test, non ancora eseguito. Le parti convengono che esso debba avvenire non oltre quarantotto ore prima dell\'orario indicato all\'articolo 2, in mancanza di che la Truccatrice può rifiutare l\'esecuzione e si applica l\'articolo 5 come in caso di recesso del Cliente.',
    not_required: 'La prestazione non richiede il patch test. Il Cliente può comunque richiederlo in qualsiasi momento prima della data di esecuzione.',
  },
};

export const noneDeclared: Record<ContractLocale, string> = {
  en: 'none declared',
  it: 'nessuna dichiarata',
};
