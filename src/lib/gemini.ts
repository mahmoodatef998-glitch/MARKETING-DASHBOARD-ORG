import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function generateEmailContent(opts: {
  type: 'payment_reminder' | 'task_reminder'
  recipientName: string
  details: string
}): Promise<{ subject: string; body: string }> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompts = {
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
    clients: any[]
    tasks: any[]
    invoices: any[]
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
