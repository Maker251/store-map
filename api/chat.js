const ALLOWED_ORIGINS = [
  'https://store-map-nine.vercel.app',
  'http://localhost:3000',
];

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// IP 기반 Rate Limiting (메모리 기반, Vercel serverless 환경에서는 인스턴스별 적용)
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1분
const RATE_LIMIT_MAX = 20; // 1분당 최대 20회

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimit.get(ip);

  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW) {
    rateLimit.set(ip, { windowStart: now, count: 1 });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

// 입력 검증
const MAX_MESSAGES = 30;
const MAX_MESSAGE_LENGTH = 10000; // 분석 시 데이터가 크므로 넉넉하게

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 'messages must be a non-empty array';
  }
  if (messages.length > MAX_MESSAGES) {
    return `messages exceeds maximum of ${MAX_MESSAGES}`;
  }
  for (const msg of messages) {
    // system, user, assistant 모두 허용
    if (!msg.role || !['user', 'assistant', 'system'].includes(msg.role)) {
      return 'invalid message role';
    }
    if (typeof msg.content === 'string' && msg.content.length > MAX_MESSAGE_LENGTH) {
      return 'message content too long';
    }
  }
  return null;
}

// 서버사이드 고정 tools 정의 (클라이언트 입력 무시)
const ALLOWED_TOOLS = [
  {
    name: "get_unvisited_stores",
    description: "미방문 매장 목록을 조회합니다.",
    input_schema: { type: "object", properties: { region: { type: "string" } } }
  },
  {
    name: "get_visited_stores",
    description: "방문 완료한 매장 목록을 조회합니다.",
    input_schema: { type: "object", properties: { region: { type: "string" } } }
  },
  {
    name: "get_completion_rate",
    description: "지역별 방문 완료율을 계산합니다.",
    input_schema: { type: "object", properties: { region: { type: "string" } } }
  },
  {
    name: "get_store_info",
    description: "특정 매장의 상세 정보를 조회합니다.",
    input_schema: { type: "object", properties: { store_number: { type: "integer" } }, required: ["store_number"] }
  },
  {
    name: "get_stores_by_region",
    description: "특정 지역의 모든 매장을 조회합니다.",
    input_schema: { type: "object", properties: { region: { type: "string" } }, required: ["region"] }
  },
  {
    name: "plan_route",
    description: "여러 매장을 효율적으로 방문할 수 있는 동선을 계획합니다.",
    input_schema: { type: "object", properties: { store_numbers: { type: "array", items: { type: "integer" } } }, required: ["store_numbers"] }
  },
  {
    name: "get_region_statistics",
    description: "전체 지역별 통계를 조회합니다.",
    input_schema: { type: "object", properties: { level: { type: "string", enum: ["시도", "구"] } }, required: ["level"] }
  },
  {
    name: "find_nearby_parking",
    description: "특정 매장 번호 근처의 공영주차장을 조회합니다. 반경(미터) 지정 가능.",
    input_schema: {
      type: "object",
      properties: {
        store_number: { type: "integer", description: "매장 번호" },
        radius: { type: "integer", description: "검색 반경 (미터, 기본값 500)" }
      }
    }
  }
];

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
  }

  try {
    const { messages } = req.body;

    // 입력 검증
    const validationError = validateMessages(messages);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // system 메시지는 Anthropic API의 system 파라미터로 분리
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const requestBody = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: chatMessages,
      tools: ALLOWED_TOOLS
    };
    if (systemMsg) {
      requestBody.system = systemMsg.content;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', errorText);
      return res.status(response.status).json({
        error: 'AI 서비스 요청에 실패했습니다.'
      });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      error: '서버 오류가 발생했습니다.'
    });
  }
}
