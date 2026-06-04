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
