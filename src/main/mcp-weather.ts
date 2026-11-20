// O clima para o Claude (Fase 108): a ferramenta weather do servidor `desktop`, pela mesma
// Open-Meteo do bloco do Início (sem chave nem conta). Só leitura, sem card: consulta só quando o
// Claude pede, para a cidade guardada nas configurações ou para outra que o usuário disse.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { describeWeather } from './weather'
import type { Weather } from './weather'
import type { WeatherPlace } from '../shared/ipc'

export interface WeatherToolsOptions {
  weather: () => Weather
  /** A cidade guardada nas configurações (o bloco Clima), ou null. */
  home: () => WeatherPlace | null
}

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean }
const text = (content: string): Result => ({ content: [{ type: 'text', text: content }] })
const failed = (content: string): Result => ({ ...text(content), isError: true })

export function registerWeatherTools(server: McpServer, options: WeatherToolsOptions): void {
  server.registerTool(
    'weather',
    {
      title: 'Ver a previsão do tempo',
      description:
        'A previsão do tempo pela Open-Meteo: agora (temperatura, céu, vento) e os próximos ' +
        '`dias` (1 a 7, padrão 3), com a chance de chuva e os milímetros. Use sempre esta ' +
        'ferramenta para clima e previsão, e não o WebSearch nem o WebFetch. `cidade`: o nome ' +
        '(ex.: "Recife", "Campinas, SP"); sem ela, vale a cidade que o usuário guardou no Wisp. ' +
        'Para avisar depois ("me avisa se for chover amanhã"), agende uma tarefa (schedule_task) ' +
        'que chame esta ferramenta e responda só NADA quando não houver o que avisar.',
      inputSchema: {
        cidade: z.string().max(100).optional(),
        dias: z.number().int().min(1).max(7).optional()
      }
    },
    async ({ cidade, dias }) => {
      let place: WeatherPlace | null = options.home()
      if (cidade?.trim()) {
        const found = await options.weather().find(cidade, 'pt')
        if ('error' in found) {
          return failed(
            found.error === 'not-found'
              ? `Não achei a cidade "${cidade}". Peça o nome de outro jeito (com o estado ou o país).`
              : `A Open-Meteo não respondeu: ${found.error}`
          )
        }
        place = found
      }
      if (!place) {
        return failed(
          'O usuário não guardou uma cidade no Wisp. Pergunte qual é (ou passe `cidade`); ' +
            'ela também pode ser guardada no bloco Clima do Início.'
        )
      }
      const result = await options.weather().forecast(place)
      if (result.state !== 'ok') {
        return failed(
          `Sem a previsão agora: ${result.state === 'error' ? result.message : 'clima desligado'}.`
        )
      }
      return text(describeWeather(result.report, dias ?? 3))
    }
  )
}
