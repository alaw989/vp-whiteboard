import { createClient } from '@supabase/supabase-js'
import type { ApiResponse, Whiteboard } from '~/types'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const supabaseUrl = config.supabaseUrl as string
  const supabaseKey = config.supabaseKey as string
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Whiteboard ID is required',
    })
  }

  // Mock data only available in development
  if (!supabaseUrl || !supabaseKey) {
    if (process.env.NODE_ENV === 'production') {
      throw createError({
        statusCode: 503,
        message: 'Database not configured',
      })
    }
    const response: ApiResponse<Whiteboard> = {
      success: true,
      data: {
        id,
        name: 'New Whiteboard (Dev)',
        project_id: 'project-1',
        created_by: 'dev-user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        canvas_state: { version: 1, elements: [] },
      },
    }
    return response
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: whiteboard, error } = await supabase
      .from('whiteboards')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      throw createError({
        statusCode: 404,
        message: 'Whiteboard not found',
      })
    }

    const response: ApiResponse<Whiteboard> = {
      success: true,
      data: whiteboard,
    }

    return response
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    const response: ApiResponse<unknown> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch whiteboard',
    }

    return response
  }
})
