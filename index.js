import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";
import xml2js from "xml2js";

const OC = process.env.LAW_OC_KEY;
if (!OC) {
  console.error("Error: LAW_OC_KEY 환경변수를 설정해주세요. (https://www.law.go.kr → 회원가입 → 마이페이지 → API인증값)");
  process.exit(1);
}
const BASE_URL = "http://www.law.go.kr/DRF";

async function lawRequest(endpoint, params) {
  const url = `${BASE_URL}/${endpoint}`;
  const response = await axios.get(url, {
    params: { OC, type: "XML", ...params },
    responseType: "text",
  });
  const parsed = await xml2js.parseStringPromise(response.data, {
    explicitArray: false,
    trim: true,
  });
  return parsed;
}

const server = new McpServer({
  name: "korean-law-api",
  version: "1.0.0",
});

// 1. 법령 검색
server.tool(
  "search_laws",
  "키워드로 법령(법률, 시행령, 시행규칙 등)을 검색합니다",
  {
    query: z.string().describe("검색 키워드 (예: '개인정보', '근로기준법')"),
    display: z.number().optional().default(20).describe("결과 수 (최대 100)"),
    page: z.number().optional().default(1).describe("페이지 번호"),
    sort: z.enum(["lawNm", "efYd", "prmYd"]).optional().default("lawNm").describe("정렬: lawNm=법령명, efYd=시행일, prmYd=공포일"),
  },
  async ({ query, display, page, sort }) => {
    const result = await lawRequest("lawSearch.do", {
      target: "law",
      query,
      display,
      page,
      sort,
    });

    const items = result?.LawSearch?.law;
    if (!items) return { content: [{ type: "text", text: "검색 결과가 없습니다." }] };

    const laws = Array.isArray(items) ? items : [items];
    const totalCnt = result?.LawSearch?.totalCnt || 0;

    const text = [
      `총 ${totalCnt}건 (${page}페이지)`,
      "",
      ...laws.map((law, i) =>
        `[${(page - 1) * display + i + 1}] ${law["법령명한글"] || ""}\n  - MST(본문조회ID): ${law["법령일련번호"] || "-"}\n  - 공포일: ${law["공포일자"] || "-"} | 시행일: ${law["시행일자"] || "-"}\n  - 소관부처: ${law["소관부처명"] || "-"} | 구분: ${law["법령구분명"] || "-"}`,
      ),
    ].join("\n");

    return { content: [{ type: "text", text }] };
  }
);

// 2. 법령 본문 조회 (MST = 법령일련번호)
server.tool(
  "get_law_content",
  "법령ID로 법령의 상세 본문(조문)을 조회합니다",
  {
    law_id: z.string().describe("법령ID (search_laws 결과의 MST/법령일련번호)"),
  },
  async ({ law_id }) => {
    const result = await lawRequest("lawService.do", {
      target: "law",
      MST: law_id,
    });

    const law = result?.["법령"];
    if (!law) return { content: [{ type: "text", text: "법령을 찾을 수 없습니다." }] };

    const info = law["기본정보"] || {};
    const articles = law["조문"]?.["조문단위"];

    const lines = [
      `# ${info["법령명_한글"] || info["법령명한글"] || ""}`,
      `- 공포번호: ${info["공포번호"] || "-"} | 공포일: ${info["공포일자"] || "-"}`,
      `- 시행일: ${info["시행일자"] || "-"}`,
      `- 소관부처: ${info["소관부처"] || "-"}`,
      "",
      "## 조문",
    ];

    if (articles) {
      const articleList = Array.isArray(articles) ? articles : [articles];
      for (const art of articleList) {
        const num = art["조문번호"] || "";
        const title = art["조문제목"] || "";
        const content = art["조문내용"] || "";
        if (title) lines.push(`\n**제${num}조 ${title}**`);
        if (content) lines.push(content.trim());
      }
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// 3. 판례 검색
server.tool(
  "search_precedents",
  "키워드로 법원 판례를 검색합니다",
  {
    query: z.string().describe("검색 키워드 (예: '손해배상', '부당해고')"),
    display: z.number().optional().default(20).describe("결과 수 (최대 100)"),
    page: z.number().optional().default(1).describe("페이지 번호"),
    court: z.string().optional().describe("법원명 필터 (예: '대법원', '서울고등법원')"),
  },
  async ({ query, display, page, court }) => {
    const params = { target: "prec", query, display, page };
    if (court) params.courtNm = court;

    const result = await lawRequest("lawSearch.do", params);

    const items = result?.PrecSearch?.prec;
    if (!items) return { content: [{ type: "text", text: "검색 결과가 없습니다." }] };

    const precs = Array.isArray(items) ? items : [items];
    const totalCnt = result?.PrecSearch?.totalCnt || 0;

    const text = [
      `총 ${totalCnt}건 (${page}페이지)`,
      "",
      ...precs.map((p, i) =>
        `[${(page - 1) * display + i + 1}] ${p["사건명"] || ""}\n  - 판례ID: ${p["판례일련번호"] || "-"}\n  - 법원: ${p["법원명"] || "-"} | 선고일: ${p["선고일자"] || "-"}\n  - 사건번호: ${p["사건번호"] || "-"}`,
      ),
    ].join("\n");

    return { content: [{ type: "text", text }] };
  }
);

// 4. 판례 본문 조회
server.tool(
  "get_precedent_content",
  "판례ID로 판례의 상세 내용을 조회합니다",
  {
    prec_id: z.string().describe("판례ID (search_precedents 결과의 판례일련번호)"),
  },
  async ({ prec_id }) => {
    const result = await lawRequest("lawService.do", {
      target: "prec",
      ID: prec_id,
    });

    // 응답 구조 탐색
    const raw = JSON.stringify(result, null, 2);
    const prec = result?.["판례"] || result?.PrecService || result?.prec;

    if (!prec) {
      return { content: [{ type: "text", text: `판례를 찾을 수 없습니다.\n\n원본 응답:\n${raw.slice(0, 500)}` }] };
    }

    const lines = [
      `# ${prec["사건명"] || prec["caseNm"] || ""}`,
      `- 사건번호: ${prec["사건번호"] || prec["caseNo"] || "-"}`,
      `- 법원: ${prec["법원명"] || "-"} | 선고일: ${prec["선고일자"] || "-"}`,
      `- 사건종류: ${prec["사건종류명"] || "-"}`,
      "",
    ];

    if (prec["판시사항"]) lines.push(`## 판시사항\n${prec["판시사항"]}\n`);
    if (prec["판결요지"]) lines.push(`## 판결요지\n${prec["판결요지"]}\n`);
    if (prec["참조조문"]) lines.push(`## 참조조문\n${prec["참조조문"]}\n`);
    if (prec["판결내용"] || prec["전문"]) lines.push(`## 판결내용\n${prec["판결내용"] || prec["전문"]}\n`);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// 5. 법령해석례 검색
server.tool(
  "search_interpretations",
  "키워드로 법령해석례(법령 해석 사례)를 검색합니다",
  {
    query: z.string().describe("검색 키워드"),
    display: z.number().optional().default(20).describe("결과 수 (최대 100)"),
    page: z.number().optional().default(1).describe("페이지 번호"),
  },
  async ({ query, display, page }) => {
    const result = await lawRequest("lawSearch.do", {
      target: "expc",
      query,
      display,
      page,
    });

    const items = result?.Expc?.expc;
    if (!items) return { content: [{ type: "text", text: "검색 결과가 없습니다." }] };

    const list = Array.isArray(items) ? items : [items];
    const totalCnt = result?.Expc?.totalCnt || 0;

    const text = [
      `총 ${totalCnt}건 (${page}페이지)`,
      "",
      ...list.map((e, i) =>
        `[${(page - 1) * display + i + 1}] ${e["안건명"] || ""}\n  - 해석ID: ${e["법령해석례일련번호"] || "-"}\n  - 안건번호: ${e["안건번호"] || "-"} | 회신일: ${e["회신일자"] || "-"}\n  - 질의: ${e["질의기관명"] || "-"} → 회신: ${e["회신기관명"] || "-"}`,
      ),
    ].join("\n");

    return { content: [{ type: "text", text }] };
  }
);

// 6. 자치법규 검색
server.tool(
  "search_ordinances",
  "키워드로 지방자치단체 조례·규칙(자치법규)을 검색합니다",
  {
    query: z.string().describe("검색 키워드"),
    display: z.number().optional().default(20).describe("결과 수 (최대 100)"),
    page: z.number().optional().default(1).describe("페이지 번호"),
    region: z.string().optional().describe("지역 필터 (예: '서울', '경기')"),
  },
  async ({ query, display, page, region }) => {
    const params = { target: "ordin", query, display, page };
    if (region) params.sigunguNm = region;

    const result = await lawRequest("lawSearch.do", params);

    const items = result?.OrdinSearch?.law;
    if (!items) return { content: [{ type: "text", text: "검색 결과가 없습니다." }] };

    const list = Array.isArray(items) ? items : [items];
    const totalCnt = result?.OrdinSearch?.totalCnt || 0;

    const text = [
      `총 ${totalCnt}건 (${page}페이지)`,
      "",
      ...list.map((o, i) =>
        `[${(page - 1) * display + i + 1}] ${o["자치법규명"] || ""}\n  - MST: ${o["자치법규일련번호"] || "-"}\n  - 지역: ${o["지자체기관명"] || "-"} | 시행일: ${o["시행일자"] || "-"} | 종류: ${o["자치법규종류"] || "-"}`,
      ),
    ].join("\n");

    return { content: [{ type: "text", text }] };
  }
);

// 7. 행정규칙 검색
server.tool(
  "search_admin_rules",
  "키워드로 행정규칙(훈령, 예규, 고시, 지침 등)을 검색합니다",
  {
    query: z.string().describe("검색 키워드"),
    display: z.number().optional().default(20).describe("결과 수 (최대 100)"),
    page: z.number().optional().default(1).describe("페이지 번호"),
  },
  async ({ query, display, page }) => {
    const result = await lawRequest("lawSearch.do", {
      target: "admbyl",
      query,
      display,
      page,
    });

    const items = result?.admRulBylSearch?.admrulbyl;
    if (!items) return { content: [{ type: "text", text: "검색 결과가 없습니다." }] };

    const list = Array.isArray(items) ? items : [items];
    const totalCnt = result?.admRulBylSearch?.totalCnt || 0;

    const text = [
      `총 ${totalCnt}건 (${page}페이지)`,
      "",
      ...list.map((a, i) =>
        `[${(page - 1) * display + i + 1}] ${a["관련행정규칙명"] || ""}\n  - 별표명: ${a["별표명"] || "-"}\n  - ID: ${a["별표일련번호"] || "-"}\n  - 소관부처: ${a["소관부처명"] || "-"} | 발령일: ${a["발령일자"] || "-"} | 종류: ${a["행정규칙종류"] || "-"}`,
      ),
    ].join("\n");

    return { content: [{ type: "text", text }] };
  }
);

// 8. 법령용어 검색
server.tool(
  "search_legal_terms",
  "법령에서 사용되는 용어의 정의를 검색합니다",
  {
    query: z.string().describe("검색할 법령 용어"),
    display: z.number().optional().default(20).describe("결과 수 (최대 100)"),
    page: z.number().optional().default(1).describe("페이지 번호"),
  },
  async ({ query, display, page }) => {
    const result = await lawRequest("lawSearch.do", {
      target: "lstrmAI",
      query,
      display,
      page,
    });

    const items = result?.lstrmAISearch?.["법령용어"];
    if (!items) return { content: [{ type: "text", text: "검색 결과가 없습니다." }] };

    const list = Array.isArray(items) ? items : [items];
    const totalCnt = result?.lstrmAISearch?.["검색결과개수"] || 0;

    const text = [
      `총 ${totalCnt}건 (${page}페이지)`,
      "",
      ...list.map((t, i) =>
        `[${(page - 1) * display + i + 1}] **${t["법령용어명"] || ""}**${t["비고"] ? `\n  ${t["비고"]}` : ""}`,
      ),
    ].join("\n");

    return { content: [{ type: "text", text }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
