import { createClient } from '@supabase/supabase-js'
import { generateSessionId } from '~/server/utils/session-id'
import type { ApiResponse, Session } from '~/types'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const supabaseUrl = config.supabaseUrl as string
  const supabaseKey = config.supabaseKey as string

  const body = await readBody(event)
  const { name } = body

  if (!name) {
    throw createError({
      statusCode: 400,
      message: 'Name is required',
    })
  }

  // Return mock data if Supabase is not configured (for testing)
  if (!supabaseUrl || !supabaseKey) {
    const shortId = generateSessionId()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const mockSession: Session = {
      id: `mock-${shortId}`,
      short_id: shortId,
      name,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      canvas_state: { version: 1, elements: [] },
    }

    const response: ApiResponse<Session> = {
      success: true,
      data: mockSession,
    }
    return response
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Generate short ID
    const shortId = generateSessionId()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const { data: session, error } = await supabase
      .from('whiteboards')
      .insert({
        // Store short_id in the name temporarily until we add the column
        name: `${name}:${shortId}`,
        created_by: 'guest',
        canvas_state: { version: 1, elements: [] },
        // expires_at will be added in a later plan
      })
      .select()
      .single()

    if (error) {
      throw createError({
        statusCode: 400,
        message: error.message,
      })
    }

    // Return session with short_id extracted
    const responseSession: Session = {
      id: session.id,
      short_id: shortId,
      name: name,
      created_at: session.created_at,
      updated_at: session.updated_at,
      expires_at: expiresAt.toISOString(),
      canvas_state: session.canvas_state,
    }

    const response: ApiResponse<Session> = {
      success: true,
      data: responseSession,
    }

    return response
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create session',
    }

    return response
  }
})
