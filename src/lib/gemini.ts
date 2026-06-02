import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export type EmailType =
  | 'payment_reminder'
  | 'task_reminder'
  | 'task_reminder_48h'
  | 'task_reminder_24h'
  | 'task_confirmation'
  | 'task_completed'
  | 'task_review_ready'
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

    task_review_ready: `Write a professional notification email to a client informing them their deliverable is ready for review and approval.
Recipient (client): ${opts.recipientName}
Task details: ${opts.details}
Return JSON: { "subject": "...", "body": "..." }
Be enthusiastic and professional. Tell them the work is ready for their review. Include a clear call-to-action to log in to the portal and approve or request revisions. Plain text body, no HTML.`,

    client_welcome: `Write a professional, warm welcome email for a new client joining a marketing agency called Pixel Marketing Agency.
Recipient (new client): ${opts.recipientName}
Details: ${opts.details}
Return JSON: { "subject": "...", "body": "..." }
Welcome them warmly. Briefly explain what to expect: dedicated team, regular updates, a client portal to track progress and approve work. Mention they can reply to this email anytime. Plain text body, no HTML.`,

    weekly_report: `Write a professional weekly progress report email from Pixel Marketing Agency to a client.
Recipient (client): ${opts.recipientName}
Week summary: ${opts.details}
Return JSON: { "subject": "...", "body": "..." }
Summarize the week's accomplishments clearly. Be positive, highlight completed work, mention upcoming tasks. Keep it brief (max 150 words). Plain text body, no HTML.`,
  }

  const result = await model.generateContent(prompts[opts.type])
  const text = result.response.text()
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(clean)
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
