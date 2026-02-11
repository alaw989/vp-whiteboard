import { createClient } from '@supabase/supabase-js'
import type { ApiResponse } from '~/types'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const supabaseUrl = config.supabaseUrl as string
  const supabaseKey = config.supabaseKey as string

  // Return mock data if Supabase is not configured (for testing)
  if (!supabaseUrl || !supabaseKey) {
    const response: ApiResponse = {
      success: true,
      data: [
        {
          id: 'mock-whiteboard-1',
          name: 'Sample Structural Review',
          project_id: 'project-1',
          created_by: 'test-user',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          canvas_state: { version: 1, elements: [] },
        },
        {
          id: 'mock-whiteboard-2',
          name: 'Foundation Plan Analysis',
          project_id: 'project-2',
          created_by: 'test-user',
          created_at: new Date(Date.now() - 86400000).toISOString(),
          updated_at: new Date(Date.now() - 3600000).toISOString(),
          canvas_state: { version: 1, elements: [] },
        },
      ],
    }
    return response
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const query = getQuery(event)

    let dbQuery = supabase
      .from('whiteboards')
      .select('*')
      .order('updated_at', { ascending: false })

    if (query.project_id) {
      dbQuery = dbQuery.eq('project_id', query.project_id as string)
    }
    if (query.created_by) {
      dbQuery = dbQuery.eq('created_by', query.created_by as string)
    }
    if (query.limit) {
      dbQuery = dbQuery.limit(parseInt(query.limit as string))
    }

    const { data: whiteboards, error } = await dbQuery

    if (error) {
      throw createError({
        statusCode: 400,
        message: error.message,
      })
    }

    const response: ApiResponse = {
      success: true,
      data: whiteboards || [],
    }

    return response
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list whiteboards',
    }

    return response
  }
})
