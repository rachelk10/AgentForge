Client-Side Specification: Business Owner Interface for Creating an Agent
Version 1.0 (MVP) · October 22, 2026 · English translation of the Hebrew specification
1. Purpose and Scope
This document defines the client side of the system, so that a small business owner with no technical background can create an agent of their own, supply it with information, choose its capabilities, test it, and publish it on their website, within minutes and without outside help.
In scope: registration and login, a creation wizard, a dashboard, an embeddable widget, and a standalone chat page.
Out of scope: the existing developer interface (App.jsx) remains a separate area for developers and the system administrator only. Also out of scope: internal admin screens (catalog, templates, users), payment and plans (room should be left in the design), live chat with a human representative, external channels such as WhatsApp, and Google Calendar integration.
2. Decisions Made
Topic
Decision
Target audience
Small business owners with no technical background
Languages
Hebrew and English with a language switch; full RTL and LTR support
Registration
Email and password, plus sign-in with Google
Agent creation
A template or a blank start, followed by a guided step-by-step wizard
Knowledge sources
Files, free text, and a website URL (page scanning)
Capabilities
Lead collection with email delivery, meeting scheduling, handoff to a representative, and an additional catalog defined in the backend (optionally by plan)
Handoff to a representative
A list of pending requests only, with no live chat
Meeting scheduling
In the MVP, based on availability hours set inside the system; Google Calendar connection later
Skills
Selection from a catalog only, with no free-form definition
Personalization
Agent name, logo, primary color, and opening message
Deployment
An embeddable widget and a standalone chat page
Number of agents
One in the MVP, with a data structure that allows expansion
After publishing
Conversations, leads, and basic usage data
Payment
Not in the MVP; room in the design for plan-locked capabilities
Technology
React with TypeScript
3. Design Principles
• Business language only. No technical term (JSON schema, execution logic, prompt, embeddings) is shown to the business owner.
• One decision per screen. Each wizard step focuses on a single subject, with a short explanation and an example.
• Control and transparency. Autosave, the ability to return to any step, and a live test before publishing.
• Dignified, understated copy. No exclamation marks and no childish language; error messages are clear and matter-of-fact.
• Bilingual writing. All text lives in translation files, with no strings in code.
4. General Structure
Registration or login → (new user) choice of starting point → five-step wizard → dashboard. A returning user who has published an agent goes straight to the dashboard; a user who has not finished enters the wizard where they stopped.
5. Screens
5.1 Registration and Login
• A single screen with two tabs (Register, Log in) and a "Continue with Google" button.
• Registration fields: full name, email, password (show/hide, strength indicator), and acceptance of the terms of use.
• A "Forgot password" link (an assumption; see section 11).
• Human-readable error messages, for example: "This email address is already registered. You can log in instead."
• A language selector available on every screen, including before login.
5.2 Starting Point
Two large cards: "Start from a template" and "Start from scratch". Choosing a template shows template cards (name, one-line description, included capabilities). The user can go back and change the choice, and fields already entered are preserved wherever possible.
5.3 Creation Wizard
Shared components: a progress bar, "Back" and "Next" buttons, autosave as a draft, and the ability to leave and return.
Step 1: The Business
• Business name (required), field of activity (a list with "Other"), and a free-text business description with an example.
• Agent name, opening message, conversation language, and tone of voice (formal, friendly, professional).
• An optional field: "Things the agent should know or avoid" (an assumption).
• The system builds the agent's instructions behind the scenes; the business owner does not see them. A preview shows how the agent will introduce itself.
Step 2: Information
• Three tabs: files (drag and drop upload; PDF, DOCX, TXT, Markdown), free text (title and content), and a website URL (entry and scan, with a list of pages that can be unchecked).
• A list of sources with a status for each item: pending, processing, ready, failed (with a reason and a retry button), plus remove and replace actions.
• A helper card, "What to upload" (frequently asked questions, price list, opening hours, policies).
• The step can be skipped, with a notice that an agent without information will answer in general terms only.
• Information search (RAG) is enabled automatically when sources exist and is not shown as a separate choice (an assumption).
Step 3: Capabilities
• Cards loaded from the backend catalog: a business-friendly name, a one-line description, an on/off switch, and a "Configure" button. The screen does not hard-code any specific capability.
• Each capability's configuration form is built from the catalog definition and worded in business language.
    ◦ Lead collection: which fields to collect (name, phone, email, message, additional fields), when to ask for them, and the email address that receives the leads.
    ◦ Meeting scheduling: available days and hours, meeting length, buffer between meetings, time zone, and an email address for confirmations.
    ◦ Handoff to a representative: when to hand off (customer request, lack of knowledge, defined topics), a notification address, and the message shown to the customer.
• "Ready-made behaviors" (Skills): selection from a list with a name and description, with no free-form editing.
• Capabilities not included in the plan are shown locked, with the explanation "Available in an advanced plan". The state comes from a flag in the catalog.
Step 4: Test
• A live chat window beside a summary of the settings, and a "New conversation" button.
• Conversations, leads, and requests created during testing are marked as tests, are not sent as notifications, and are not counted in usage data (an assumption).
• An "Edit" link beside each group of settings.
Step 5: Appearance and Publishing
• Personalization: logo (PNG, JPG, or SVG, with a size limit), primary color (with a contrast check against text), and a live preview of the widget.
• A "Publish" button. After publishing, the following are shown: a short embed code with a copy button and brief instructions, and a link to a standalone chat page.
5.4 Dashboard
Side navigation: Overview, Conversations, Leads, Meetings (an assumption), Pending requests, My agent, Account.
• Overview: an active/paused switch; counts of conversations, messages, leads, and meetings for 7 and 30 days; a conversations-per-day chart; and a "Recommended to complete" card (for example, when no information has been uploaded).
• Conversations: a list with date, first message, message count, and tags (lead, meeting, handed off); search and filtering; a full conversation view.
• Leads: a table of the collected fields, date, a link to the conversation, and status (new, handled); CSV export.
• Meetings: a list of scheduled meetings, with the option to cancel.
• Pending requests: the customer's details, the reason for handoff, time, and a link to the conversation; a "Handled" mark and an internal note. An email notification for each new request.
• My agent: the same wizard screens as editing pages (business, information, capabilities, appearance, embedding), with a warning about unsaved changes.
• Paused agent: the widget and chat page display a message that the service is currently unavailable.
5.5 Widget and Chat Page
• Widget: a floating button in the corner (the side is determined by writing direction), opening a chat window with the logo, agent name, and opening message. On mobile it opens full screen.
• Standalone chat page: a unique URL, with the same look and behavior.
• Language and direction: language detection from the host page or browser, and automatic text direction based on message content.
• Lead collection: the agent asks for the details within the conversation, and a confirmation message is shown at the end.
• Meeting scheduling: available times are shown as selection buttons inside the chat (an assumption).
• Handoff to a representative: the customer is told that the request has been passed on and is asked how they prefer to be contacted.
• Transparency: a small note at the bottom stating that the replies are automated (an assumption).
• Loading and errors: a typing indicator, and a well-worded error message with a retry.
6. Starter Templates (Proposal)
Three templates in the first stage: customer service, sales and lead collection, and appointment and meeting scheduling. Each template includes fields pre-filled in the wizard (description, tone, opening message) and suggested capabilities. Templates are stored in the backend and managed with versions.
7. Translating Technical Concepts into Business Language
System concept
What the business owner sees
Agent
"Agent" (an assumption: or "digital assistant"; see section 11)
Tool
Capability
Skill
Ready-made behavior
Documents / RAG
Business information, information sources
System prompt
Not shown; built automatically from the fields
Conversation
Conversation
Lead
Lead
Handoff
A request pending handling
JSON schema, execution logic
Not shown at all
8. System States
• Loading: content skeletons rather than a full-screen spinner.
• Empty state: a short explanation and one clear action.
• File processing: a status for each source, with automatic refresh.
• Network error: a message and a retry, without data loss.
• Session expiry: return to login and restoration of the draft.
• Destructive actions: explicit confirmation before removing information, pausing an agent, or deleting.
9. Non-Functional Requirements
• Language and direction: full i18n, logical CSS properties (margin-inline-start and the like), and date and number formatting by language.
• Responsiveness: the dashboard for desktop and mobile; the widget is mobile-first.
• Accessibility: WCAG 2.1 AA, including contrast, keyboard navigation, and screen reader labels.
• Performance: a lightweight widget that loads without blocking the host site (suggested target: up to 50KB compressed).
• Security: the widget uses a public key that does not expose owner data; rate limiting; an allowed-domains list (a proposal); sanitizing message content against XSS; limiting file type and size; removing the developer interface from the public path and restricting it to administrator permission.
• Privacy: a notice to the business owner about their responsibility when collecting leads, and the ability to delete a conversation or a lead.
10. Technical Recommendations
Recommendations only; they can be replaced:
• Vite, React, and TypeScript, with React Router for navigation.
• TanStack Query for server data; react-hook-form with zod for forms and validation.
• react-i18next for translation.
• An accessible component library such as Radix with shadcn/ui, styled with Tailwind.
• Automatic type generation from FastAPI's OpenAPI schema (for example, openapi-typescript).
• The widget as a separate, lightweight package: a short script that adds an isolated iframe.
• Testing: Vitest with Testing Library, and Playwright for the full flow from registration to publishing.
11. Backend Dependencies
Gaps identified against the existing system:
• Wiring the existing registration endpoint, adding Google OAuth, and password recovery.
• Website scanning with a processing status for each source, and support for a free-text source type.
• A capabilities catalog with business-friendly names and descriptions, field definitions for rendering forms, and a plan flag.
• A catalog of ready-made behaviors (Skills) with a business description.
• Lead collection: storage, email delivery, and export.
• Availability and meetings: setting hours, calculating free slots, booking, and email confirmation.
• A model for pending handoff requests, with an email notification.
• Templates: storage, versions, and applying one to a new agent.
• Automatic construction of the agent's instructions from the wizard fields.
• Public endpoints for the widget and the chat page: a public key, rate limiting, and domain control.
• Aggregated usage data, and marking of test conversations.
• Logo upload.
• A data structure of an account with agents (one in the MVP, ready for several).
12. Proposed Implementation Order
1. Infrastructure: routing, i18n and RTL, authentication, and types from OpenAPI.
2. Registration and login, and wizard steps 1 to 3.
3. Test and publish, widget, and chat page.
4. Dashboard: overview, conversations, leads, meetings, and pending requests.
5. Templates, accessibility, polish, and edge-case testing.
Future extensions: Google Calendar connection, plans and payment, multiple agents per account, external channels, live chat, an AI-assistant interview inside the wizard, and expanded personalization.
13. Assumptions and Open Questions
• The interface term: "agent" or "digital assistant".
• Whether changes after publishing take effect immediately, or require an additional "Publish" action.
• Password recovery and email verification at registration.
• File size limits and the page limit when scanning a website.
• How the login token is stored (in memory or in an httpOnly cookie).
• Names and descriptions of the capabilities in the full catalog.
• Data deletion policy and lead privacy.
• Showing meetings as a separate tab in the dashboard, and a note about automated replies in the widget (assumptions marked above).