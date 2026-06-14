import { createHmac } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { isValidSessionId } from '~/server/utils/session-id'
import type { Session } from '~/types'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const shortId = getRouterParam(event, 'id')

  if (!shortId || !isValidSessionId(shortId)) {
    return sendRedirect(event, '/', 302)
  }

  // If Supabase not configured, use mock
  const supabaseUrl = config.supabaseUrl as string
  const supabaseKey = config.supabaseKey as string

  let whiteboardId: string

  if (!supabaseUrl || !supabaseKey) {
    whiteboardId = `mock-${shortId}`
  } else {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { data: whiteboard } = await supabase
      .from('whiteboards')
      .select('id')
      .like('name', `%:${shortId}`)
      .single()

    if (!whiteboard) {
      return sendRedirect(event, '/', 302)
    }
    whiteboardId = whiteboard.id
  }

  // Set share cookie
  const secret = config.authSecret as string
  if (secret) {
    const token = createHmac('sha256', secret).update(`share:${whiteboardId}`).digest('hex')
    setCookie(event, 'vp-share-access', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60,
      path: '/',
    })
  }

  return sendRedirect(event, `/whiteboard/${whiteboardId}`, 302)
})
