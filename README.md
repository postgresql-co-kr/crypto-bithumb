# 빗썸 실시간 암호화폐 시세 표시기

빗썸 거래소의 암호화폐 시세를 터미널에 실시간으로 표시하는 커맨드 라인 인터페이스(CLI) 애플리케이션입니다.

## 주요 기능

-   **실시간 시세 추적**: 웹소켓을 통해 빗썸의 암호화폐 데이터를 실시간으로 가져와 표시합니다.
-   **한글 코인 이름 지원**: API를 통해 코인의 한글 이름을 가져와 심볼과 함께 표시합니다.
-   **사용자 정의 코인 목록**: `config.json` 파일을 통해 추적할 코인을 쉽게 설정할 수 있습니다.
-   **수익률 계산**: `config.json`에 입력된 평균 매수 단가에 기반하여 실시간 수익률을 계산하고 표시합니다.
-   **시장 분위기 분석**: 추적 중인 코인들의 전반적인 등락률을 기반으로 시장의 흐름(상승, 하락, 보합)을 보여줍니다.
-   **다양한 정렬 및 필터링**: 변동률, 이름순으로 정렬하거나 표시할 코인의 개수를 지정할 수 있습니다.

## 브랜치 안내

이 프로젝트는 두 개의 브랜치로 운영됩니다.

-   **`main` 브랜치 (기본):**
    -   빗썸 API 키 없이 누구나 사용할 수 있는 공개 버전입니다.
    -   `config.json`에 직접 정의한 코인 목록의 실시간 시세와 수익률을 추적합니다.

-   **`pro` 브랜치:**
    -   빗썸에서 발급받은 **API Key**와 **Secret Key**가 필요한 전문가용 버전입니다.
    -   **주요 추가 기능:** 사용자가 빗썸 계좌에 보유한 모든 자산을 자동으로 가져와 표시하며, 총 매수금액, 총 평가금액, 총 평가손익 등 상세 포트폴리오 정보를 제공합니다.
    -   `pro` 브랜치를 사용하려면 `git checkout pro` 명령어로 전환한 후, 프로젝트 루트에 `api_keys.json` 파일을 생성하고 발급받은 키를 입력해야 합니다.

---

## 설치 및 실행 방법

### 1. 개발 환경 설정 (최초 1회)

이 애플리케이션을 실행하기 위해 필요한 `Git`, `Node.js`, `pnpm`을 먼저 설치해야 합니다.

#### Git 설치

소스 코드를 내려받기 위해 Git이 필요합니다.

-   **Windows**: [Git for Windows](https://git-scm.com/download/win)를 다운로드하여 설치합니다.
-   **macOS**: 터미널에 아래 명령어를 입력하여 Xcode Command Line Tools를 설치합니다.
    ```bash
    xcode-select --install
    ```
-   **Linux (Debian/Ubuntu)**:
    ```bash
    sudo apt-get update
    sudo apt-get install git
    ```

#### Node.js 설치

JavaScript 런타임 환경인 Node.js가 필요합니다. (v16 이상 권장)

-   **Windows**: [nodejs.org](https://nodejs.org/ko/)에서 LTS 버전을 다운로드하여 설치합니다.
-   **macOS & Linux**: `nvm`(Node Version Manager)을 사용하여 설치하는 것을 권장합니다. `nvm`을 사용하면 여러 Node.js 버전을 쉽게 관리할 수 있습니다.
    1.  `nvm` 설치 (터미널에 아래 명령어 입력):
        ```bash
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        ```
    2.  터미널 재시작 후, Node.js LTS 버전 설치:
        ```bash
        nvm install --lts
        nvm use --lts
        ```

#### pnpm 설치

이 프로젝트는 `pnpm`을 패키지 매니저로 사용합니다. Node.js 설치 후, 터미널에 아래 명령어를 입력하여 `pnpm`을 전역으로 설치합니다.

```bash
npm install -g pnpm
```

### 2. 프로젝트 설정

1.  **저장소 복제:**
    ```bash
    git clone https://github.com/postgresql-co-kr/crypto-bithumb.git
    cd crypto-bithumb
    ```

2.  **의존성 설치:**
    프로젝트 폴더로 이동한 후, 필요한 라이브러리를 설치합니다.
    ```bash
    pnpm install
    ```

3.  **`config.json` 파일 설정:**
    프로젝트의 루트 디렉터리에 `config.json` 파일을 생성하고 추적할 코인 정보를 입력해야 합니다. 아래는 기본 형식입니다.

    ```json
    {
      "coins": [
        {
          "symbol": "BTC",
          "icon": "₿",
          "averagePurchasePrice": 50000000,
          "unit_currency": "KRW"
        },
        {
          "symbol": "ETH",
          "icon": "Ξ",
          "averagePurchasePrice": 3000000,
          "unit_currency": "KRW"
        },
        {
          "symbol": "XRP",
          "icon": "✕",
          "averagePurchasePrice": 0,
          "unit_currency": "KRW"
        }
      ]
    }
    ```
    -   `symbol`: 코인의 티커 심볼 (예: "BTC", "ETH"). **대문자로 입력해야 합니다.**
    -   `icon`: 코인 이름 옆에 표시될 아이콘 (이모지 등).
    -   `averagePurchasePrice`: 사용자의 평균 매수 단가 (숫자). 이 값을 기준으로 수익률이 계산됩니다. 수익률을 보고 싶지 않다면 `0`으로 설정하세요.
    -   `unit_currency`: 기준 통화. 현재는 `"KRW"`만 지원합니다.

    **팁:** 프로젝트에는 `config.json-top30`과 `config.json-top50` 파일이 미리 포함되어 있습니다. 이 파일들 중 하나를 `config.json`으로 이름을 변경하여 바로 사용할 수 있습니다.
    예를 들어, 시가총액 상위 30개 코인을 보고 싶다면 아래 명령어를 사용하세요.
    ```bash
    # macOS / Linux
    mv config.json-top30 config.json

    # Windows (Command Prompt)
    rename config.json-top30 config.json
    ```

### 3. 실행

1.  **애플리케이션 빌드:**
    TypeScript 코드를 JavaScript로 컴파일합니다. 코드 수정 시마다 이 과정이 필요합니다.
    ```bash
    pnpm build
    ```

2.  **애플리케이션 실행:**
    ```bash
    node dist/index.js
    ```
    -   애플리케이션을 종료하려면 `Ctrl+C`를 누르세요.

#### 실행 옵션

커맨드 라인 인수를 통해 테이블의 정렬 순서와 표시 개수를 변경할 수 있습니다.

-   `--sort-by`: 정렬 기준을 선택합니다.
    -   `rate` (기본값): 등락률 기준 내림차순 정렬.
        ```bash
        node dist/index.js --sort-by rate
        ```
    -   `name`: 코인 이름(심볼) 기준 오름차순 정렬.
        ```bash
        node dist/index.js --sort-by name
        ```

-   `--limit`: 표시할 코인의 최대 개수를 지정합니다.
    -   예시: 상위 10개만 표시
        ```bash
        node dist/index.js --limit 10
        ```

-   **옵션 조합:**
    ```bash
    node dist/index.js --sort-by name --limit 15
    ```

---

## 출력 예시

Bithumb 실시간 시세 (Ctrl+C to exit) - Debate300.com
> 전체 시장: 상승세 📈 | 체결강도: 105.12

| 코인 | 현재가 | 체결강도 | 수익률 | 전일대비 | 전일대비금액 | 시가 | 고가 | 저가 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| ₿ BTC 비트코인 | 91,123,000 KRW | 115.42 | +2.50% | +1.25% | +1,123,000 KRW | 90,000,000 | 92,000,000 | 89,500,000 |
| Ξ ETH 이더리움 | 4,550,000 KRW | 98.78 | -1.10% | -0.55% | -25,000 KRW | 4,575,000 | 4,600,000 | 4,500,000 |
| ✕ XRP 리플 | 720 KRW | 89.30 | - | -2.70% | -20 KRW | 740 | 745 | 715 |

## 라이선스

이 프로젝트는 ISC 라이선스를 따릅니다.