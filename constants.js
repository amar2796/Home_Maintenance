/* ═══════════════════════════════════════════════════════════════════
   CENTRAL CONSTANTS — constants.js
   ───────────────────────────────────────────────────────────────────
   Single source of truth for all project-specific values.
   To switch this system to a different mandir / religious institution:
     1. Update the fields in this file.
     2. Sync the marked fields (✔ SYNC) to CFG in appscript.txt.
   Everything else — page titles, sidebar, receipts, emails, storage
   keys, placeholders, modals — updates automatically from APP.

   ── SYNC CHECKLIST ─────────────────────────────────────────────────
   These fields must match CFG in appscript.txt exactly:
     ✔ name                → CFG.name
     ✔ location / address  → CFG.location / CFG.address
     ✔ receiptPrefix       → CFG.receiptPrefix
     ✔ legacyReceiptPrefix → CFG.legacyReceiptPrefix
     ✔ emailDailyLimit     → CFG.emailDailyLimit
     ✔ signatory           → CFG.signatory
     ✔ designation         → CFG.designation
     ✔ tagline             → CFG.tagline
     ✔ thankYouMsg         → CFG.thankYouMsg
     ✔ version             → CFG.version
     ✔ splashText          → CFG.splashText
     ✔ heroText            → CFG.heroText
     ✔ heroSub             → CFG.heroSub
     ✔ committee           → CFG.committee
   ═══════════════════════════════════════════════════════════════════ */

   const APP = {

      /* ── VERSION ───────────────────────────────────────────────────────
         Shown in admin sidebar footer and login page version label.
         ✔ SYNC with CFG.version in appscript.txt whenever you update. */
      version: "2.2.0",
    
    
      /* ── IDENTITY ──────────────────────────────────────────────────────
         name      : Full display name of the mandir / institution.
                     Used in page titles, header, emails, PDF receipts,
                     donate modal, T&C, sidebar, and member section.
         shortName : Short abbreviation (2–5 chars). Used as the prefix
                     for all localStorage keys so they don't clash if you
                     run two instances on the same domain.
                     e.g. "SHM" → keys: shm_remember_token, shm_lang …
         nameHindi : Hindi name — used in hero section and member bios.
         ✔ SYNC name with CFG.name in appscript.txt. */
      name:      "Shree Hanuman Mandir",
      shortName: "SHM",
      nameHindi: "श्री हनुमान मंदिर",
    
    
      /* ── LOCATION ──────────────────────────────────────────────────────
         village / district / state / pin : Individual address parts.
         location : Auto-built as "village, district" — used in header
                    subtitle, map label, donate modal, PDF receipts.
         address  : Auto-built as full address — used in emails and PDFs.
         ✔ SYNC location / address with CFG.location / CFG.address. */
      village:  "Paliya",
      district: "Sultanpur",
      state:    "Uttar Pradesh",
      pin:      "",                         // Optional — leave blank if not needed
      get location() { return this.village + ", " + this.district; },
      get address()  { return this.village + ", " + this.district + ", " + this.state; },
    
    
      /* ── CONTACT ───────────────────────────────────────────────────────
         Displayed in emails, chatbot, and admin settings panel.
         These are NOT synced to appscript — frontend-only. */
      phone:   "+918127991402",
      email:   "hanumanmandirpaliya@gmail.com",
      website: "https://amar2796.github.io/Mandir_Contribution_System/",
    
    
      /* ── HOMEPAGE DISPLAY ──────────────────────────────────────────────
         These control what is shown on the public homepage (index.html).
         Change these when switching to a different mandir.
    
         splashText : Text shown on the full-screen splash / loading screen.
                      Typically a greeting or deity name in the local language.
         heroText   : Main heading in the hero banner section.
         heroSub    : Sub-heading shown below the hero heading (e.g. founder
                      name, ashram name, or a short phrase).
         committee  : Managing trust / committee name — shown in the donate
                      modal declaration ("managed by ...").
         ✔ SYNC splashText, heroText, heroSub, committee with appscript CFG. */
      splashText: "॥ जय श्री राम ॥",
      heroText:   "|| श्री हनुमत आश्रम ||",
      heroSub:    "राम जग विश्‍वकर्मा",
      committee:  "Ram Jag Vishwakarma Committee",
    
    
      /* ── BRANDING & MESSAGES ───────────────────────────────────────────
         tagline    : Short phrase used in email footers, PDF receipts,
                      T&C modal sign-off, feedback section, and chatbot.
                      e.g. "Jai Shree Ram", "Jai Jinendra", "Waheguru".
         thankYouMsg: Shown on PDF receipt thank-you section and emails.
         footerNote : Printed at the bottom of system-generated PDFs.
         symbol     : Emoji / Unicode symbol for the religion or deity.
                      Used in PDF receipt header and WhatsApp messages.
                      e.g. "🕉️" (Om), "✡️" (Star of David), "☪️" (Crescent)
         ✔ SYNC tagline and thankYouMsg with appscript CFG. */
      tagline:    "Jai Shree Ram",
      thankYouMsg: "Thank you for your generous contribution",
      footerNote: "This is a system-generated receipt.",
      symbol:     "🕉️",
    
    
      /* ── RECEIPT & FINANCE ─────────────────────────────────────────────
         receiptPrefix       : Prefix for new receipt IDs.
                               e.g. "MNR" → MNR-2025-00001
                               Change this when switching institutions.
         legacyReceiptPrefix : Old prefix from before any migration.
                               Used only in .replace() to display old IDs
                               correctly — do NOT change once deployed.
         currency            : Currency symbol shown on receipts and UI.
         currencyCode        : ISO 4217 currency code (informational).
         ✔ SYNC receiptPrefix and legacyReceiptPrefix with appscript CFG. */
      receiptPrefix:       "MNR",
      legacyReceiptPrefix: "TRX",
      currency:     "₹",          // Symbol used in HTML/UI display
      currencyText: "Rs.",         // Text form used in jsPDF (Helvetica can't render ₹). SYNC with CFG.currencyText in appscript.txt
      currencyCode: "INR",
    
    
      /* ── BANK & UPI (Donate Modal) ─────────────────────────────────────
         upiId : Publicly shown UPI ID for the QR code and copy button.
                 Safe to keep here as it is already public.
         ⚠ SECURITY: Real bank details (accountNo, ifscCode, bankName,
           bankBranch, accountName, accountType) are intentionally blank
           here. They live in CFG in appscript.txt only and are fetched
           server-side via getPaymentDetails with session verification.
           Do NOT put real account numbers back into this file. */
      upiId:            "Not Available",  // ← update if you have a public UPI ID to share
      accountHolderName: "",  // ← Fallback account holder name (used in copy if server returns blank). e.g. "Ram Jag Vishwakarma Committee"
      accountName: "",   // ← kept blank intentionally — fetched server-side (this is the account holder name)
      accountNo:   "",   // ← kept blank intentionally — fetched server-side
      ifscCode:    "",   // ← kept blank intentionally — fetched server-side
      bankName:    "",   // ← kept blank intentionally — fetched server-side
      bankBranch:  "",   // ← kept blank intentionally — fetched server-side
      accountType: "",   // ← kept blank intentionally — fetched server-side
    
    
      /* ── AUTHORIZED SIGNATORY (PDF Receipts) ──────────────────────────
         Shown at the bottom of every generated PDF receipt.
         signatory   : Name or title of the signing authority.
         designation : Their role / title.
         ✔ SYNC both with appscript CFG. */
      signatory:   "Temple Trust",
      designation: "Authorized Signatory",
    
    
      /* ── EMAIL QUOTA ───────────────────────────────────────────────────
         Gmail free tier allows 100 emails/day. Keep a buffer for OTPs.
         Reducing this value limits automated emails (receipts, reports).
         ✔ SYNC with CFG.emailDailyLimit in appscript.txt. */
      emailDailyLimit: 90,
    
    
      /* ── LOCALE ────────────────────────────────────────────────────────
         Used for number formatting (toLocaleString) across all JS files.
         e.g. "en-IN" for India, "en-US" for USA, "hi-IN" for Hindi-India.
         Change this when deploying for a different region. */
      locale: "en-IN",
    
    
      /* ── MAP ───────────────────────────────────────────────────────────
         Google Maps embed URL for the location/feedback section on index.html.
         How to get your embed URL:
           Google Maps → search your temple → Share → Embed a map → copy src URL.
         Leave blank ("") to hide the map iframe entirely. */
      mapEmbedUrl: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3273.497389457402!2d82.20519597492734!3d26.321060585267084!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x399a790bd4e8dff3%3A0x93c61c2049ae55f2!2sHanuman%20Mandir!5e1!3m2!1sen!2sin!4v1775203315104!5m2!1sen!2sin",
    
    
      /* ── GOOGLE DRIVE FOLDER IDs ───────────────────────────────────────
         IDs of Drive folders where uploaded files are stored.
         Create sub-folders in your Drive, paste the folder IDs here.
         ✔ SYNC all folder IDs with appscript CFG (folderProfile, etc.).
    
         How to get a folder ID:
           Open the folder in Google Drive → copy the ID from the URL:
           https://drive.google.com/drive/folders/<<THIS_PART>> */
      folderMain:    "1fw9No8nevduhe1yeILZUrbJHdDH_Lt9f",  // Legacy main upload folder
      folderProfile: "1z9vb3mPu8DVB7htuB_vku0cC2dTc7Pa7",  // Drive > ProfilePhotos/
      folderExpense: "1YY55xNxs5_LNCNjYYkq0oeEzoZBg5qKv",  // Drive > ExpenseReceipts/
      folderGallery: "1ecYdcFZrSF2mKX15mDYh8vi4Oat9jF2n",  // Drive > GalleryPhotos/
      folderSlip:    "1c60FzCP3ECU_XBckWfBVkcWyNb-ikNIk",   // Drive > PaymentSlips/
    
    };