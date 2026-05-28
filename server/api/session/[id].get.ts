import { createHmac } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { isValidSessionId } from '~/server/utils/session-id'
import type { ApiResponse, Session } from '~/types'

function setShareCookie(event: any, whiteboardId: string) {
  const config = useRuntimeConfig()
  const secret = config.authSecret as string
  if (!secret) return

  const token = createHmac('sha256', secret).update(`share:${whiteboardId}`).digest('hex')
  setCookie(event, 'vp-share-access', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60, // 24 hours
    path: '/',
  })
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const supabaseUrl = config.supabaseUrl as string
  const supabaseKey = config.supabaseKey as string

  const shortId = getRouterParam(event, 'id')

  if (!shortId) {
    throw createError({
      statusCode: 400,
      message: 'Session ID is required',
    })
  }

  // Validate short ID format (8 chars, URL-safe)
  if (!isValidSessionId(shortId)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid session ID format',
    })
  }

  // Return mock data if Supabase is not configured
  if (!supabaseUrl || !supabaseKey) {
    const mockSession: Session = {
      id: `mock-${shortId}`,
      short_id: shortId,
      name: 'Mock Session',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      canvas_state: { version: 1, elements: [] },
    }

    const response: ApiResponse<Session> = {
      success: true,
      data: mockSession,
    }
    setShareCookie(event, mockSession.id)
    return response
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Query by name pattern (temporary, will use short_id column after migration)
    // The name is stored as "originalName:shortId"
    const { data: whiteboard, error } = await supabase
      .from('whiteboards')
      .select('*')
      .like('name', `%:${shortId}`)
      .single()

    if (error || !whiteboard) {
      throw createError({
        statusCode: 404,
        message: 'Session not found',
      })
    }

    // Extract original name and create Session object
    const nameParts = whiteboard.name.split(':')
    const originalName = nameParts[0]

    const session: Session = {
      id: whiteboard.id,
      short_id: shortId,
      name: originalName,
      created_at: whiteboard.created_at,
      updated_at: whiteboard.updated_at,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Temporary
      canvas_state: whiteboard.canvas_state,
    }

    const response: ApiResponse<Session> = {
      success: true,
      data: session,
    }
    setShareCookie(event, session.id)
    return response
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    const response: ApiResponse<unknown> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch session',
    }

    return response
  }
})
