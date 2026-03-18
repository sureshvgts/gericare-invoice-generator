import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

export function useBills(limit?: number, offset?: number) {
  return useQuery({
    queryKey: ['bills', { limit, offset }],
    queryFn: () => api.getBills(limit, offset),
  })
}

export function useUploadMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.uploadFiles,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
    },
  })
}
