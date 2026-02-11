import { createClient } from '@supabase/supabase-js'
import type { ApiResponse } from '~/types'

export default defineEventHandler(async (event) => {
  try {
    const config = useRuntimeConfig()
    const supabaseUrl = config.supabaseUrl as string
    const supabaseKey = config.supabaseKey as string

    if (!supabaseUrl || !supabaseKey) {
      throw createError({
        statusCode: 500,
        message: 'Supabase configuration missing',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const id = getRouterParam(event, 'id')

    if (!id) {
      throw createError({
        statusCode: 400,
        message: 'Whiteboard ID is required',
      })
    }

    const body = await readBody(event)
    const { name, canvas_state } = body

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (name !== undefined) updateData.name = name
    if (canvas_state !== undefined) updateData.canvas_state = canvas_state

    const { data: whiteboard, error } = await supabase
      .from('whiteboards')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw createError({
        statusCode: 400,
        message: error.message,
      })
    }

    const response: ApiResponse = {
      success: true,
      data: whiteboard,
    }

    return response
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update whiteboard',
    }

    return response
  }
})
