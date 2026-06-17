import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export type EmailType =
  | 'payment_reminder'
  | 'task_reminder'
  | 'task_reminder_48h'
  | 'task_reminder_24h'
  | 'task_confirmation'
  | 'task_completed'
  | 'task_in_review'
  | 'task_assigned'
  | 'client_welcome'
  | 'weekly_report'

export async function generateEmailContent(opts: {
  type: EmailType
  recipientName: string
  details: string
}): Promise<{ subject: string; body: string }> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompts: Record<EmailType, string> = {
    payment_reminder: `Write a professional, friendly payment reminder email.
Recipient: ${opts.recipientName}
Details: ${opts.details}
Return JSON: { "subject": "...", "body": "..." }
Keep it concise, firm but polite. Plain text body, no HTML.`,

    task_reminder: `Write a professional task deadline reminder email.
Recipient: ${opts.recipientName}
Details: ${opts.details}
Return JSON: { "subject": "...", "body": "..." }
Keep it concise and action-oriented. Plain text body, no HTML.`,

    task_reminder_48h: `Write a professional task reminder email for a team member. The task is due in 48 hours.
Recipient (team member): ${opts.recipientName}
Task details: ${opts.details}
Return JSON: { "subject": "...", "body": "..." }
Tone: friendly but focused. Mention the 48-hour countdown clearly. Include all task details. Plain text body, no HTML.`,

    task_reminder_24h: `Write an urgent task reminder email for a team member. The task is due in 24 hours — tomorrow.
Recipient (team member): ${opts.recipientName}
Task details: ${opts.details}
Return JSON: { "subject": "...", "body": "..." }
Tone: more urgent. Stress the 24-hour deadline. Encourage final preparations. Plain text body, no HTML.`,

    task_confirmation: `Write a task confirmation request email. Today is the task's due date.
Recipient (team member): ${opts.recipientName}
Task details: ${opts.details}
Return JSON: { "subject": "...", "body": "..." }
Ask the team member to confirm whether they completed the task today. Remind them to update the task status to "Done" in the dashboard. Plain text body, no HTML.`,

    task_completed: `Write a professional task completion notification email to a client.
Recipient (client): ${opts.recipientName}
Task details: ${opts.details}
Return JSON: { "subject": "...", "body": "..." }
Inform the client that their task has been completed. Be positive and professional. Invite them to review the work and reach out with feedback. Plain text body, no HTML.`,

    task_in_review: `Write a professional notification email to a client informing them that their task is ready for review and approval.
Recipient (client): ${opts.recipientName}
Task details: ${opts.details}
Return JSON: { "subject": "...", "body": "..." }
Be enthusiastic and clear. Ask them to log in to the client portal to review and either approve or request revisions. Plain text body, no HTML.`,

    task_assigned: `Write a professional task assignment notification email to a team member.
Recipient (team member): ${opts.recipientName}
Task details: ${opts.details}
Return JSON: { "subject": "...", "body": "..." }
Tone: clear, motivating, and professional. Include ALL task details (title, description, priority, due date, client). Mention the due date prominently. Encourage them to start promptly. Plain text body, no HTML.`,

    client_welcome: `Write a warm welcome email to a new client onboarding to a marketing agency's dashboard.
Recipient: ${opts.recipientName}
Details: ${opts.details}
Return JSON: { "subject": "...", "body": "..." }
Be friendly and professional. Mention the client portal URL and encourage them to explore their tasks and invoices. Plain text body, no HTML.`,

    weekly_report: `Write a concise weekly report email summarizing task progress for a client.
Recipient: ${opts.recipientName}
Details: ${opts.details}
Return JSON: { "subject": "...", "body": "..." }
Be professional and positive. Summarize completed and upcoming tasks clearly. Plain text body, no HTML.`,
  }

  const result = await model.generateContent(prompts[opts.type])
  const text = result.response.text()
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(clean)
}

export async function generateCaption(opts: {
  taskTitle: string
  taskType?: string
  description?: string
  clientName?: string
}): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const typeLabel: Record<string, string> = {
    reel_video: 'a short video / reel',
    design:     'a design / graphic',
    ai_video:   'an AI-generated video',
    post:       'a social media post',
    custom:     'content',
  }
  const contentType = opts.taskType ? (typeLabel[opts.taskType] ?? 'content') : 'content'
  const prompt = `Write an engaging social media caption for ${contentType}.
Task: ${opts.taskTitle}${opts.description ? `\nContext: ${opts.description}` : ''}${opts.clientName ? `\nBrand: ${opts.clientName}` : ''}
Requirements: catchy, 2-3 sentences max, include 3-5 relevant hashtags at the end.
Return ONLY the caption text (no JSON, no quotes, no explanation).`

  const result = await model.generateContent(prompt)
  return result.response.text().trim()
}

export async function analyzeFinancials(data: {
  revenue:      { thisMonth: number; lastMonth: number; ytd: number }
  expenses:     { thisMonth: number; lastMonth: number; ytd: number; byCategory: Record<string, number> }
  profit:       { thisMonth: number; lastMonth: number }
  outstanding:  { total: number; count: number; overdueTotal: number; overdueCount: number }
  mrr:          number
  collectionRate: number
  cashFlow:     Array<{ month: string; revenue: number; expenses: number; profit: number }>
  topClients:   Array<{ name: string; revenue: number }>
  overdueInvoices: Array<{ invoice_number: string; client: string; total: number; due_date: string }>
}): Promise<{ health_score: number; summary: string; insights: Array<{ type: string; title: string; detail: string }>; recommendations: Array<{ priority: string; title: string; detail: string; action_type: string; action_label?: string; action_data?: Record<string, unknown> }> }> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `You are a CFO AI assistant for a marketing agency. Analyze this financial data and return a JSON object.

FINANCIAL DATA:
${JSON.stringify(data, null, 2)}

Return ONLY valid JSON (no markdown, no explanation):
{
  "health_score": <0-100 integer based on profit margin, collection rate, outstanding debt>,
  "summary": "<2-3 sentence executive summary of financial health>",
  "insights": [
    { "type": "<warning|info|success>", "title": "<short title>", "detail": "<one sentence>" }
  ],
  "recommendations": [
    {
      "priority": "<high|medium|low>",
      "title": "<action title>",
      "detail": "<what to do and why>",
      "action_type": "<send_payment_reminders|generate_invoice|none>",
      "action_label": "<button label if action_type != none>",
      "action_data": {}
    }
  ]
}

Rules:
- health_score: 80-100 = healthy, 60-79 = caution, 0-59 = critical
- Max 3 insights, max 4 recommendations, ordered by priority
- Be specific with numbers from the data (use actual amounts)
- action_type "send_payment_reminders" when overdue invoices exist
- action_type "generate_invoice" when billing plan renewal is due
- action_type "none" for informational recommendations`

  const result = await model.generateContent(prompt)
  const text = result.response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(text)
}

export async function chatWithAssistant(opts: {
  message: string
  history: Array<{ role: 'user' | 'model'; parts: string }>
  context: {
    clients: Record<string, unknown>[]
    tasks: Record<string, unknown>[]
    invoices: Record<string, unknown>[]
  }
}): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const systemContext = `You are an AI assistant for Agency OS, a project management dashboard.
You have access to the following live data:

CLIENTS (${opts.context.clients.length} total):
${JSON.stringify(opts.context.clients.slice(0, 20), null, 2)}

TASKS (${opts.context.tasks.length} total):
${JSON.stringify(opts.context.tasks.slice(0, 20), null, 2)}

INVOICES (${opts.context.invoices.length} total):
${JSON.stringify(opts.context.invoices.slice(0, 20), null, 2)}

Answer questions about clients, tasks, and invoices. Be concise and helpful.
Format numbers as currency where appropriate. Use markdown for structure.`

  const chat = model.startChat({
    history: [
      { role: 'user', parts: [{ text: systemContext }] },
      { role: 'model', parts: [{ text: 'Understood! I have access to your agency data and am ready to help.' }] },
      ...opts.history.map((m) => ({ role: m.role, parts: [{ text: m.parts }] })),
    ],
  })

  const result = await chat.sendMessage(opts.message)
  return result.response.text()
}
