# 빗썸 실시간 암호화폐 시세 표시기

빗썸 거래소의 암호화폐 시세를 터미널에 실시간으로 표시하는 커맨드 라인 인터페이스(CLI) 애플리케이션입니다.

## 주요 기능

-   **실시간 시세 추적**: 웹소켓을 통해 빗썸의 암호화폐 데이터를 실시간으로 가져와 표시합니다.
-   **사용자 정의 코인 목록**: `config.json` 파일을 통해 추적할 코인을 쉽게 설정할 수 있습니다.
-   **수익률 계산**: 사용자의 평균 매수 단가에 기반하여 수익률을 계산하고 표시합니다.
-   **시장 분위기 분석**: 추적 중인 코인들의 전반적인 등락률을 기반으로 시장 분위기(상승장, 하락장 등)를 보여줍니다.
-   **체결 강도**: 개별 코인의 체결 강도와 전체 시장의 가중 평균 체결 강도를 표시합니다.

---

## 설치 및 실행 방법

### 1. 개발 환경 설정 (최초 1회)

이 애플리케이션을 실행하기 위해 필요한 `Git`, `Node.js`, `pnpm`을 먼저 설치합니다.

#### Git 설치

소스 코드를 내려받기 위해 Git이 필요합니다.

-   **Windows**: [Git for Windows](https://git-scm.com/download/win)를 다운로드하여 설치합니다.
-   **macOS**: Xcode Command Line Tools를 통해 설치합니다. 터미널에 아래 명령어를 입력하세요.
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
    git clone https://github.com/yoonoh/crypto-bithumb.git
    cd crypto-bithumb
    ```

2.  **의존성 설치:**
    ```bash
    pnpm install
    ```

3.  **`config.json` 파일 설정:**
    애플리케이션을 실행하기 전에, `config.json` 파일을 생성하고 추적할 코인을 설정해야 합니다. 아래는 예시입니다.

    ```json
    {
      "coins": [
        {
          "symbol": "BTC",
          "icon": "₿",
          "averagePurchasePrice": 50000000
        },
        {
          "symbol": "ETH",
          "icon": "Ξ",
          "averagePurchasePrice": 3000000
        },
        {
          "symbol": "XRP",
          "icon": "✕",
          "averagePurchasePrice": 0
        }
      ]
    }
    ```
    -   `symbol`: 코인의 티커 심볼 (예: "BTC", "ETH").
    -   `icon`: 코인 이름 옆에 표시될 아이콘.
    -   `averagePurchasePrice`: 평균 매수 단가. 0으로 설정 시, '-' 표시됩니다.

### 3. 실행

1.  **애플리케이션 빌드:**
    TypeScript 코드를 JavaScript로 컴파일합니다.
    ```bash
    pnpm build
    ```

2.  **애플리케이션 실행:**
    ```bash
    node dist/index.js
    ```
    -   애플리케이션을 종료하려면 `Ctrl+C`를 누르세요.

#### 실행 옵션

커맨드 라인 인수를 통해 테이블의 정렬 순서를 변경할 수 있습니다.

-   `node dist/index.js --sort-by rate`
    -   **기본값.** 코인 등락률을 기준으로 내림차순 정렬합니다.
-   `node dist/index.js --sort-by name`
    -   코인 이름(심볼)을 기준으로 오름차순 정렬합니다.

---

## 출력 예시

Bithumb 실시간 시세 (Ctrl+C to exit)
> 전체 시장: 상승세 📈 | 체결강도: 110.25

| 코인 | 현재가 | 체결강도 | 수익률 | 변동률(24H) | 변동금액(24H) | 고가(24H) | 저가(24H) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| ₿ BTC | 51,000,000 KRW | 120.50 | +2.00% | +2.00% | +1,000,000 KRW | 52,000,000 | 50,000,000 |
| Ξ ETH | 3,100,000 KRW | 95.75 | +3.33% | +1.64% | +50,000 KRW | 3,150,000 | 3,050,000 |
| ✕ XRP | 750 KRW | 88.10 | -1.32% | -1.32% | -10 KRW | 760 | 740 |

## 라이선스

이 프로젝트는 ISC 라이선스를 따릅니다.
