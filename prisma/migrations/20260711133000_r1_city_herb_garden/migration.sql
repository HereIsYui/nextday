CREATE TABLE "city_herb_garden_plot" (
    "plot_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "city_id" TEXT NOT NULL,
    "plot_index" INTEGER NOT NULL,
    "herb_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'empty',
    "planted_at" TIMESTAMP(3),
    "ready_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "city_herb_garden_plot_pkey" PRIMARY KEY ("plot_id")
);

CREATE UNIQUE INDEX "city_herb_garden_plot_city_id_plot_index_key"
ON "city_herb_garden_plot"("city_id", "plot_index");
CREATE INDEX "city_herb_garden_plot_player_id_city_id_idx"
ON "city_herb_garden_plot"("player_id", "city_id");
CREATE INDEX "city_herb_garden_plot_ready_at_idx"
ON "city_herb_garden_plot"("ready_at");

ALTER TABLE "city_herb_garden_plot"
ADD CONSTRAINT "city_herb_garden_plot_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "player"("player_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "city_herb_garden_plot"
ADD CONSTRAINT "city_herb_garden_plot_city_id_fkey"
FOREIGN KEY ("city_id") REFERENCES "player_city"("city_id")
ON DELETE CASCADE ON UPDATE CASCADE;
