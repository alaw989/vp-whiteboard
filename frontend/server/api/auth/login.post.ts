import { createHmac } from 'crypto'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const password = config.authPassword as string
  const secret = config.authSecret as string

  if (!password || !secret) {
    throw createError({ statusCode: 500, message: 'Auth not configured' })
  }

  const body = await readBody(event)
  const submittedPassword = body?.password

  if (!submittedPassword || submittedPassword !== password) {
    throw createError({ statusCode: 401, message: 'Invalid password' })
  }

  const token = createHmac('sha256', secret).update(password).digest('hex')

  setCookie(event, 'vp-auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: '/',
  })

  return { success: true }
})
