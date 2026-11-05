/**
 * Every institute fact shown on screen lives in this file. An empty string renders nothing, so a
 * TODO value below can stay empty until the real value is known.
 */

export type HelplineNumber = { display: string; tel: string };

export type Helpline = {
  id: string;
  name: string;
  description: string;
  numbers: HelplineNumber[];
  /** Where this was checked. Do not add a helpline without an official source and a date. */
  sources: { url: string; note: string; checkedOn: string }[];
};

export const site = {
  productName: "Student Wellbeing",

  institute: {
    name: "Indian Institute of Technology (Indian School of Mines) Dhanbad",
    shortName: "IIT (ISM) Dhanbad",
    url: "https://www.iitism.ac.in",
  },

  /** Supplied by the institute. A missing file falls back to a built in mark or illustration. */
  assets: {
    logo: "/brand/logo.svg",
    campusPhoto: "/images/campus.jpg",
  },

  healthCenter: {
    name: "Health Center",
    /**
     * Source: https://people.iitism.ac.in/~healthcenter/ checked on 2026-10-31.
     * Confirm the phone numbers and email with the Health Center before launch.
     */
    url: "https://people.iitism.ac.in/~healthcenter/",
    phones: [
      { label: "Landline", display: "0326-223-5988", tel: "+913262235988" },
      { label: "Mobile", display: "8987499047", tel: "+918987499047" },
      { label: "Mobile", display: "7707018449", tel: "+917707018449" },
    ],
    email: "cmoic@iitism.ac.in",
    /** TODO: get the postal address from the Health Center. Empty shows nothing. */
    address: "",
    /** TODO: get the opening hours from the Health Center. Empty shows nothing. */
    openingHours: "",
  },

  helplines: [
    {
      id: "tele-manas",
      name: "Tele MANAS",
      description: "Mental health support. Toll free, 24 hours, Government of India.",
      numbers: [
        { display: "14416", tel: "14416" },
        { display: "1-800 891 4416", tel: "18008914416" },
      ],
      sources: [
        {
          url: "https://telemanas.mohfw.gov.in/",
          note: "Ministry of Health and Family Welfare. States both toll free numbers.",
          checkedOn: "2026-10-31",
        },
        {
          url: "https://jipmer.edu.in/Tele-MANAS",
          note: "JIPMER's Tele MANAS page. States the service runs 24x7.",
          checkedOn: "2026-10-31",
        },
      ],
    },
    {
      id: "emergency-112",
      name: "National emergency number",
      description: "Call if you or someone else is in immediate danger.",
      numbers: [{ display: "112", tel: "112" }],
      sources: [
        {
          url: "https://www.mha.gov.in/en/commoncontent/emergency-response-support-system-erss",
          note: "Ministry of Home Affairs, Emergency Response Support System. Source given by the project owner. The page refused automated browsers on the check date, so confirm it by hand.",
          checkedOn: "2026-10-31",
        },
      ],
    },
  ] satisfies Helpline[],
};
