Vou corrigir isso criando um modo de preview específico para o editor Lovable, sem mexer no comportamento normal do domínio escalaxpró.com.

Plano:
1. Criar uma detecção segura de ambiente Lovable/preview para saber quando o app está rodando dentro do editor.
2. No ambiente do editor, evitar qualquer lógica que dependa de domínio publicado, cache antigo, rastreamento, service worker ou redirecionamento que possa quebrar o iframe de preview.
3. Ajustar a configuração do Vite para aceitar os hosts internos do Lovable e melhorar o carregamento do preview embutido.
4. Manter o app normal no domínio escalaxpró.com, com a mesma tela e funcionalidades publicadas.
5. Validar abrindo o preview interno no caminho principal `/` e confirmar que ele carrega em vez de mostrar a página indisponível.

Detalhes técnicos:
- A correção será feita apenas no frontend/Vite.
- Não vou alterar banco de dados, pagamentos, autenticação ou DNS.
- O objetivo é fazer o editor carregar o app no domínio interno `id-preview--...lovable.app`/`lovableproject.com`, mesmo que o domínio publicado continue sendo `escalaxpró.com`.