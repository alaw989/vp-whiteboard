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

    const { error } = await supabase
      .from('whiteboards')
      .delete()
      .eq('id', id)

    if (error) {
      throw createError({
        statusCode: 400,
        message: error.message,
      })
    }

    const response: ApiResponse<unknown> = {
      success: true,
    }

    return response
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    const response: ApiResponse<unknown> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete whiteboard',
    }

    return response
  }
})
