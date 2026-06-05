import styled from 'styled-components';

// matrix-style line loader (uiverse.io)
const MatrixLoader = () => (
  <StyledWrapper>
    <div className="loader" />
  </StyledWrapper>
);

const StyledWrapper = styled.div`
  .loader {
    --_lineThickness: var(--line-thickness, 10%);

    width: 60px;
    height: 60px;
    background: linear-gradient(
        #0000 calc(1 * 160% / 6),
        #22d3ee 0 calc(3 * 115% / 6),
        #0000 0
      ),
      linear-gradient(
        #0000 calc(2 * 110% / 6),
        #22d3ee 0 calc(4 * 110% / 6),
        #0000 0
      ),
      linear-gradient(
        #0000 calc(3 * 100% / 6),
        #22d3ee 0 calc(5 * 107.6% / 6),
        #0000 0
      ),
      linear-gradient(
        #0000 calc(2 * 0% / 6),
        #22d3ee 0 calc(4 * 22% / 6),
        #0000 0
      );
    background-size: var(--_lineThickness) 400%;
    background-repeat: no-repeat;
    animation: matrix 1s infinite linear;
  }

  @keyframes matrix {
    0% {
      background-position: 0% 100%, 50% 100%, 100% 100%, 100% 100%;
    }

    100% {
      background-position: 0% 0%, 50% 0%, 100% 0%, 100% 0%;
    }
  }
`;

export default MatrixLoader;
