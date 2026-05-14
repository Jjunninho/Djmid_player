# 🎧 DJ MID — MIDI Mixer Pro

O **DJ MID** é um reprodutor e console de mixagem MIDI avançado baseado em navegador. Ele permite não apenas a reprodução de arquivos `.mid`, mas também a personalização sonora completa através do suporte a **SoundFonts (.sf2)** e um rack de efeitos integrados, funcionando como uma mini-estação de trabalho de áudio digital (DAW) portátil.

## 🚀 Funcionalidades Principais

- **Suporte a SoundFonts (.sf2):** Personalize o timbre dos instrumentos carregando seus próprios bancos de sons diretamente no player.
- **Mixagem de 16 Canais:** Controle individual de volume, pan e mute para cada um dos 16 canais padrão MIDI.
- **Rack de Efeitos Profissional:**
  - **Reverb:** Controle de Room Size, Mix e Damping.
  - **Chorus:** Ajustes de Rate, Depth e Mix.
  - **Delay:** Configuração de Time, Feedback e Mix.
- **Visualização em Tempo Real:**
  - **Piano Roll:** Acompanhe as notas de todos os canais simultaneamente com zoom ajustável (até 8x).
  - **Event Log:** Monitoramento técnico das mensagens MIDI processadas.
- **Controle de Performance:** Ajuste de BPM em tempo real, loop de reprodução e Master EQ com Limiter integrado.
- **Gestão de Sessão:** Botões para salvar (**SAV**) e carregar (**LOD**) configurações de mixagem.

## 🛠️ Tecnologias Utilizadas

- **Web Audio API:** Para o processamento de áudio de baixa latência e rack de efeitos.
- **SpessaSynth / MIDI.js (ou similares):** Para a renderização de SoundFonts e interpretação de arquivos MIDI.
- **HTML5 / CSS3:** Interface estilo "Hardware Rack" otimizada para fluxo de trabalho de DJ/Produtor.

## 🎮 Como Usar

1. Acesse o [DJ MID Player](https://jjunninho.github.io/Djmid_player/).
2. Arraste um arquivo **.sf2** para o campo indicado para definir a qualidade dos instrumentos.
3. Arraste um arquivo **.mid** (ex: Led Zeppelin, Rolling Stones) para iniciar a reprodução.
4. Utilize o painel de **Channels** para mixar os instrumentos.
5. Experimente ligar os efeitos de **Reverb** e **Delay** para dar profundidade ao som.

---
Desenvolvido por [Jjunninho](https://github.com/Jjunninho)
