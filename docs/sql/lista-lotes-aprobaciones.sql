SELECT b.LotId,
       b.DestinationId,
       b.DestinationName,
       b.ContainersMoved,
       b.KilogramsMoved,
       b.LitersMoved,
       b.ContainersBalance,
       b.KilogramsBalance,
       b.LitersBalance
FROM dbo.vw_FinishedProductMovementBalances AS b
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.vw_FinishedProductMovements AS m
    WHERE m.LotId = b.LotId
      AND m.FromDestinationId = b.DestinationId
)
ORDER BY b.DestinationName;
