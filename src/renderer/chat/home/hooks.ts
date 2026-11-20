// Os ganchos que mais de um bloco do Início usa.
import { useEffect, useState } from 'react'
import type { Todo } from '../../../shared/ipc'

/** As suas tarefas, ao vivo (o Wisp também mexe nelas). */
export function useTodos(): Todo[] | null {
  const [todos, setTodos] = useState<Todo[] | null>(null)
  useEffect(() => {
    let alive = true
    void window.wisp.home.todos().then((list) => {
      if (alive) setTodos(list)
    })
    const off = window.wisp.home.onTodos(setTodos)
    return () => {
      alive = false
      off()
    }
  }, [])
  return todos
}
