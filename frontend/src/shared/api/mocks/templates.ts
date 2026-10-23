import type { Template } from "../../../api/contracts/templates";

export const mockTemplates: Template[] = [
  {
    id: "customer-service",
    name: { en: "Customer service", he: "שירות לקוחות" },
    description: {
      en: "Answers common questions and explains your policies.",
      he: "עונה על שאלות נפוצות ומסביר את מדיניות העסק.",
    },
    capabilities: [
      { id: "handoff", name: { en: "Handoff to a representative", he: "העברה לנציג" } },
    ],
    defaults: {
      businessDescription: {
        en: "We help our customers with questions about our products, orders and policies.",
        he: "אנו עוזרים ללקוחותינו בשאלות על המוצרים, ההזמנות והמדיניות שלנו.",
      },
      openingMessage: {
        en: "Hello, I am here to answer your questions. How can I help you today?",
        he: "שלום, אני כאן כדי לענות על שאלותיך. במה אוכל לעזור היום?",
      },
      tone: "professional",
    },
  },
  {
    id: "sales-leads",
    name: { en: "Sales and lead collection", he: "מכירות ואיסוף לידים" },
    description: {
      en: "Presents your offering and collects details from interested customers.",
      he: "מציג את ההצעה שלכם ואוסף פרטים מלקוחות מתעניינים.",
    },
    capabilities: [
      { id: "lead-collection", name: { en: "Lead collection", he: "איסוף לידים" } },
    ],
    defaults: {
      businessDescription: {
        en: "We offer products and services to customers who are looking for a suitable solution.",
        he: "אנו מציעים מוצרים ושירותים ללקוחות המחפשים פתרון מתאים.",
      },
      openingMessage: {
        en: "Hello, welcome. Tell me what you are looking for and I will help you find it.",
        he: "שלום, ברוכים הבאים. ספרו לי מה אתם מחפשים ואעזור לכם למצוא זאת.",
      },
      tone: "friendly",
    },
  },
  {
    id: "appointments",
    name: { en: "Appointments and meetings", he: "תיאום תורים ופגישות" },
    description: {
      en: "Lets customers choose an available time and confirms the meeting.",
      he: "מאפשר ללקוחות לבחור מועד פנוי ומאשר את הפגישה.",
    },
    capabilities: [
      { id: "meeting-scheduling", name: { en: "Meeting scheduling", he: "קביעת פגישות" } },
      { id: "handoff", name: { en: "Handoff to a representative", he: "העברה לנציג" } },
    ],
    defaults: {
      businessDescription: {
        en: "We receive customers by appointment and offer meetings at set hours.",
        he: "אנו מקבלים לקוחות בתיאום מראש ומציעים פגישות בשעות קבועות.",
      },
      openingMessage: {
        en: "Hello, I can help you book an appointment. When would suit you?",
        he: "שלום, אוכל לעזור לכם לקבוע תור. מתי יהיה לכם נוח?",
      },
      tone: "friendly",
    },
  },
];
