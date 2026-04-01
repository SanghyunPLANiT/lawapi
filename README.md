# 국가법령정보 MCP 서버

[국가법령정보 공동활용](https://www.law.go.kr) Open API를 Claude에서 바로 사용할 수 있는 MCP 서버입니다.

## 제공 도구

| 도구 | 설명 |
|------|------|
| `search_laws` | 법령(법률·시행령·시행규칙) 키워드 검색 |
| `get_law_content` | 법령 본문 조문 조회 |
| `search_precedents` | 판례 키워드 검색 |
| `get_precedent_content` | 판례 상세 내용 조회 |
| `search_interpretations` | 법령해석례 검색 |
| `search_ordinances` | 자치법규(조례·규칙) 검색 |
| `search_admin_rules` | 행정규칙(훈령·예규·고시·지침) 검색 |
| `search_legal_terms` | 법령 용어 검색 |

## 설치

```bash
git clone https://github.com/SanghyunPLANiT/lawapi.git
cd lawapi
npm install
```

## API 키 발급

1. [국가법령정보 공동활용](https://www.law.go.kr) 회원가입
2. 로그인 후 **마이페이지 → API인증값변경** 메뉴에서 OC값 확인

## Claude Desktop 설정

`~/Library/Application Support/Claude/claude_desktop_config.json` 에 추가:

```json
{
  "mcpServers": {
    "korean-law-api": {
      "command": "node",
      "args": ["/절대경로/lawapi/index.js"],
      "env": {
        "LAW_OC_KEY": "여기에_본인_OC값_입력"
      }
    }
  }
}
```

설정 후 Claude Desktop을 재시작하면 법령 검색 도구가 활성화됩니다.
